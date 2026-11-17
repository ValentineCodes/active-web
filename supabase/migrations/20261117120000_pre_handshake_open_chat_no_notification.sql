-- Opening pre-handshake chat must not notify the responder until a real message is sent.

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
BEGIN
  SELECT rr.request_id, rr.responder_id, rr.status, r.requester_id, r.status, r.expires_at
    INTO v_request_id, v_responder_id, v_response_status, v_requester_id, v_request_status, v_expires_at
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

  IF v_conversation_id IS NULL THEN
    SELECT c.id
      INTO v_conversation_id
    FROM public.request_conversations c
    WHERE c.response_id = p_response_id;
  END IF;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation could not be opened' USING errcode = '55000';
  END IF;

  RETURN v_conversation_id;
END;
$$;