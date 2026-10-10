-- Pre-handshake chat: the requester must send the first user message; responders reply only after that.

CREATE OR REPLACE FUNCTION public.conversation_requester_initiated_chat(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.request_messages m
    JOIN public.request_conversations c ON c.id = m.conversation_id
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id = c.requester_id
      AND m.message_type <> 'system'::public.conversation_message_type
  );
$$;

COMMENT ON FUNCTION public.conversation_requester_initiated_chat(uuid) IS
  'True once the requester has sent at least one non-system message in this conversation.';

CREATE OR REPLACE FUNCTION public.conversation_sending_allowed_for_participant(
  p_conversation_id uuid,
  p_user_id uuid
)
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
      AND p_user_id IN (c.requester_id, c.selected_user_id)
      AND (
        (
          EXISTS (
            SELECT 1
            FROM public.handshakes h
            WHERE h.request_id = c.request_id
              AND h.selected_user_id = c.selected_user_id
          )
          AND r.selected_user_id = c.selected_user_id
          AND public.request_conversation_messaging_enabled(r.status)
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM public.handshakes h
            WHERE h.request_id = c.request_id
          )
          AND r.status = ANY (
            ARRAY[
              'posted'::public.request_status,
              'searching'::public.request_status
            ]
          )
          AND r.expires_at > now()
          AND rr.status = 'pending'::public.response_status
          AND (
            p_user_id = c.requester_id
            OR public.conversation_requester_initiated_chat(p_conversation_id)
          )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.conversation_sending_allowed_for_participant(uuid, uuid) IS
  'Per-participant send permission; pre-handshake responders may send only after the requester has messaged.';

CREATE OR REPLACE FUNCTION public.conversation_sending_allowed(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.conversation_sending_allowed_for_participant(
    p_conversation_id,
    public.assert_authenticated()
  );
$$;

CREATE OR REPLACE FUNCTION public.get_responder_pre_handshake_conversation(p_request_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT c.id
  FROM public.request_responses rr
  JOIN public.request_conversations c
    ON c.response_id = rr.id
   AND c.request_id = rr.request_id
   AND c.selected_user_id = rr.responder_id
  WHERE rr.request_id = p_request_id
    AND rr.responder_id = public.assert_authenticated()
    AND public.request_conversation_is_accessible(c.id, rr.responder_id)
    AND public.conversation_requester_initiated_chat(c.id);
$$;

CREATE OR REPLACE FUNCTION public.resolve_request_conversation_for_viewer(p_lookup_id uuid)
RETURNS TABLE(
  conversation_id uuid,
  request_id uuid,
  requester_id uuid,
  selected_user_id uuid,
  response_id uuid,
  request_status public.request_status,
  messaging_enabled boolean,
  is_pre_handshake boolean,
  request_title text,
  request_description text,
  counterparty_id uuid,
  counterparty_display_name text,
  counterparty_avatar_path text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_conversation_id uuid;
BEGIN
  IF public.request_conversation_is_accessible(p_lookup_id, v_user_id) THEN
    v_conversation_id := p_lookup_id;
  ELSE
    SELECT c.id
      INTO v_conversation_id
    FROM public.request_conversations c
    JOIN public.requests r ON r.id = c.request_id
    JOIN public.handshakes h
      ON h.request_id = c.request_id
     AND h.requester_id = c.requester_id
     AND h.selected_user_id = c.selected_user_id
    WHERE c.request_id = p_lookup_id
      AND v_user_id IN (c.requester_id, c.selected_user_id)
      AND r.selected_user_id = c.selected_user_id;
  END IF;

  IF v_conversation_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.request_id,
    c.requester_id,
    c.selected_user_id,
    c.response_id,
    r.status,
    public.conversation_sending_allowed_for_participant(c.id, v_user_id),
    NOT EXISTS (
      SELECT 1
      FROM public.handshakes h
      WHERE h.request_id = c.request_id
    ),
    r.title,
    r.description,
    CASE
      WHEN v_user_id = c.requester_id THEN c.selected_user_id
      ELSE c.requester_id
    END,
    p.display_name,
    p.avatar_path,
    c.created_at,
    c.updated_at
  FROM public.request_conversations c
  JOIN public.requests r ON r.id = c.request_id
  JOIN public.profiles p
    ON p.id = CASE
      WHEN v_user_id = c.requester_id THEN c.selected_user_id
      ELSE c.requester_id
    END
  WHERE c.id = v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_request_conversation(p_request_id uuid)
RETURNS TABLE(
  conversation_id uuid,
  request_id uuid,
  requester_id uuid,
  selected_user_id uuid,
  request_status public.request_status,
  messaging_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH me AS (SELECT public.assert_authenticated() AS user_id)
  SELECT
    c.id,
    c.request_id,
    c.requester_id,
    c.selected_user_id,
    r.status,
    public.conversation_sending_allowed_for_participant(c.id, me.user_id),
    c.created_at,
    c.updated_at
  FROM me
  JOIN public.request_conversations c
    ON c.request_id = p_request_id
   AND me.user_id IN (c.requester_id, c.selected_user_id)
  JOIN public.handshakes h
    ON h.request_id = c.request_id
   AND h.requester_id = c.requester_id
   AND h.selected_user_id = c.selected_user_id
  JOIN public.requests r
    ON r.id = c.request_id
   AND r.selected_user_id = c.selected_user_id;
$$;

CREATE OR REPLACE FUNCTION public.list_my_request_conversations()
RETURNS TABLE(
  conversation_id uuid,
  request_id uuid,
  request_title text,
  request_status public.request_status,
  messaging_enabled boolean,
  counterparty_id uuid,
  counterparty_display_name text,
  counterparty_avatar_path text,
  counterparty_avatar_captured_in_app boolean,
  latest_message_body text,
  latest_message_at timestamptz,
  latest_message_sender_id uuid,
  unread_count integer,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH me AS (SELECT public.assert_authenticated() AS user_id)
  SELECT
    c.id,
    c.request_id,
    r.title,
    r.status,
    public.conversation_sending_allowed_for_participant(c.id, me.user_id),
    CASE
      WHEN me.user_id = c.requester_id THEN c.selected_user_id
      ELSE c.requester_id
    END,
    p.display_name,
    p.avatar_path,
    p.avatar_captured_in_app,
    latest.body,
    latest.created_at,
    latest.sender_id,
    coalesce(unread.count, 0),
    c.updated_at
  FROM me
  JOIN public.request_conversations c
    ON me.user_id IN (c.requester_id, c.selected_user_id)
   AND public.request_conversation_is_accessible(c.id, me.user_id)
  JOIN public.requests r ON r.id = c.request_id
  JOIN public.profiles p
    ON p.id = CASE
      WHEN me.user_id = c.requester_id THEN c.selected_user_id
      ELSE c.requester_id
    END
  LEFT JOIN LATERAL (
    SELECT m.body, m.created_at, m.sender_id
    FROM public.request_messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) latest ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS count
    FROM public.request_messages m
    WHERE m.conversation_id = c.id
      AND m.message_type = 'text'::public.conversation_message_type
      AND m.sender_id <> me.user_id
      AND m.read_at IS NULL
  ) unread ON true
  ORDER BY c.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.conversation_requester_initiated_chat(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_requester_initiated_chat(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.conversation_requester_initiated_chat(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.conversation_sending_allowed_for_participant(uuid, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_sending_allowed_for_participant(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.conversation_sending_allowed_for_participant(uuid, uuid) TO service_role;
