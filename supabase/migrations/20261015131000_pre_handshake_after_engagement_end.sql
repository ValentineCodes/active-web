-- Pre-handshake chat must work after a prior engagement ends (handshake rows remain on the request).

CREATE OR REPLACE FUNCTION public.conversation_sending_allowed(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.request_conversations c
    JOIN public.requests r ON r.id = c.request_id
    JOIN public.request_responses rr ON rr.id = c.response_id
      AND rr.request_id = c.request_id
      AND rr.responder_id = c.selected_user_id
    WHERE c.id = p_conversation_id
      AND (
        (
          EXISTS (
            SELECT 1
            FROM public.handshakes h
            WHERE h.response_id = c.response_id
          )
          AND r.selected_user_id = c.selected_user_id
          AND public.request_conversation_messaging_enabled(r.status)
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM public.handshakes h
            WHERE h.response_id = c.response_id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.requests active
            WHERE active.id = c.request_id
              AND active.selected_user_id IS NOT NULL
              AND active.status = ANY (public.attending_request_statuses())
          )
          AND rr.status = 'pending'::public.response_status
          AND (
            (
              r.status = ANY (
                ARRAY[
                  'posted'::public.request_status,
                  'searching'::public.request_status
                ]
              )
              AND r.expires_at > now()
            )
            OR r.status = 'awaiting_review'::public.request_status
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.open_pre_handshake_conversation(p_response_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_request_id uuid;
  v_requester_id uuid;
  v_responder_id uuid;
  v_request_status public.request_status;
  v_response_status public.response_status;
  v_expires_at timestamptz;
  v_conversation_id uuid;
  v_inserted boolean := false;
  v_requester_name text;
  v_requester_first text;
  v_request_title text;
BEGIN
  SELECT rr.request_id, rr.responder_id, rr.status, r.requester_id, r.status, r.expires_at, r.title
    INTO v_request_id, v_responder_id, v_response_status, v_requester_id, v_request_status, v_expires_at, v_request_title
  FROM public.request_responses rr
  JOIN public.requests r ON r.id = rr.request_id
  WHERE rr.id = p_response_id
  FOR UPDATE OF rr, r;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'response not found' USING errcode = 'P0002';
  END IF;

  IF v_requester_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'only the request owner can start a discussion' USING errcode = '42501';
  END IF;

  IF v_response_status IS DISTINCT FROM 'pending'::public.response_status THEN
    RAISE EXCEPTION 'this response is no longer available for discussion' USING errcode = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.requests r
    WHERE r.id = v_request_id
      AND r.selected_user_id IS NOT NULL
      AND r.status = ANY (public.attending_request_statuses())
  ) THEN
    RAISE EXCEPTION 'this request already has a selected helper' USING errcode = '55000';
  END IF;

  IF v_request_status NOT IN (
    'posted'::public.request_status,
    'searching'::public.request_status,
    'awaiting_review'::public.request_status
  ) THEN
    RAISE EXCEPTION 'this request is no longer open for discussion' USING errcode = '55000';
  END IF;

  IF v_request_status IN ('posted'::public.request_status, 'searching'::public.request_status)
     AND v_expires_at <= now() THEN
    RAISE EXCEPTION 'this request is no longer open for discussion' USING errcode = '55000';
  END IF;

  INSERT INTO public.request_conversations (
    request_id,
    requester_id,
    selected_user_id,
    response_id,
    created_at,
    updated_at
  )
  VALUES (
    v_request_id,
    v_requester_id,
    v_responder_id,
    p_response_id,
    now(),
    now()
  )
  ON CONFLICT (response_id) DO NOTHING
  RETURNING id INTO v_conversation_id;

  IF v_conversation_id IS NOT NULL THEN
    v_inserted := true;
  ELSE
    SELECT c.id
      INTO v_conversation_id
    FROM public.request_conversations c
    WHERE c.response_id = p_response_id;
  END IF;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation could not be opened' USING errcode = '55000';
  END IF;

  IF v_inserted THEN
    SELECT p.display_name
      INTO v_requester_name
    FROM public.profiles p
    WHERE p.id = v_requester_id;

    v_requester_first := coalesce(public.display_first_name(v_requester_name), 'The requester');

    PERFORM public.create_notification(
      v_responder_id,
      'pre_handshake_chat:' || v_conversation_id::text,
      'new_message'::public.notification_type,
      format('%s wants to discuss your offer', v_requester_first),
      coalesce(v_request_title, 'Request'),
      format('/conversation/%s', v_conversation_id),
      v_request_id,
      p_response_id,
      NULL,
      NULL,
      v_user_id,
      jsonb_build_object('conversation_id', v_conversation_id, 'pre_handshake', true),
      true
    );
  END IF;

  RETURN v_conversation_id;
END;
$$;
