-- Workers see creator-initiated project chat on the project screen and in Messages.

CREATE OR REPLACE FUNCTION public.get_worker_project_pre_handshake_conversation(p_project_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT c.id
  FROM public.project_assignments a
  JOIN public.project_conversations c ON c.assignment_id = a.id
  WHERE a.project_id = p_project_id
    AND a.worker_id = public.assert_authenticated()
    AND a.status <> 'cancelled'::public.project_assignment_status
    AND public.project_conversation_is_accessible(c.id, a.worker_id)
    AND public.conversation_project_creator_initiated_chat(c.id);
$$;

GRANT EXECUTE ON FUNCTION public.get_worker_project_pre_handshake_conversation(uuid) TO authenticated;

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
  counterparty_identity_verified boolean,
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
  SELECT *
  FROM (
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
      public.user_marketplace_identity_verified(p.id),
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

    UNION ALL

    SELECT
      c.id,
      c.project_id,
      p.title,
      'posted'::public.request_status,
      public.conversation_sending_allowed_for_participant(c.id, me.user_id),
      CASE
        WHEN me.user_id = c.creator_id THEN c.worker_id
        ELSE c.creator_id
      END,
      prof.display_name,
      prof.avatar_path,
      prof.avatar_captured_in_app,
      public.user_marketplace_identity_verified(prof.id),
      latest.body,
      latest.created_at,
      latest.sender_id,
      coalesce(unread.count, 0),
      c.updated_at
    FROM me
    JOIN public.project_conversations c
      ON me.user_id IN (c.creator_id, c.worker_id)
     AND public.project_conversation_is_accessible(c.id, me.user_id)
    JOIN public.projects p ON p.id = c.project_id
    JOIN public.profiles prof
      ON prof.id = CASE
        WHEN me.user_id = c.creator_id THEN c.worker_id
        ELSE c.creator_id
      END
    LEFT JOIN LATERAL (
      SELECT m.body, m.created_at, m.sender_id
      FROM public.project_messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS count
      FROM public.project_messages m
      WHERE m.conversation_id = c.id
        AND m.message_type = 'text'::public.conversation_message_type
        AND m.sender_id <> me.user_id
        AND m.read_at IS NULL
    ) unread ON true
  ) rows
  ORDER BY rows.updated_at DESC;
$$;

ALTER TABLE public.user_conversation_focus
  DROP CONSTRAINT IF EXISTS user_conversation_focus_conversation_id_fkey;

CREATE OR REPLACE FUNCTION public.set_request_conversation_focus(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  IF p_conversation_id IS NULL THEN
    DELETE FROM public.user_conversation_focus
    WHERE user_id = v_user_id;
    RETURN;
  END IF;

  IF NOT public.request_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
  END IF;

  INSERT INTO public.user_conversation_focus (user_id, conversation_id, updated_at)
  VALUES (v_user_id, p_conversation_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET conversation_id = excluded.conversation_id,
        updated_at = excluded.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_request_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_lookup_id uuid;
BEGIN
  IF NOT public.request_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
  END IF;

  IF public.project_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    SELECT c.project_id
      INTO v_lookup_id
    FROM public.project_conversations c
    WHERE c.id = p_conversation_id;

    UPDATE public.project_messages m
    SET read_at = coalesce(m.read_at, now())
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id <> v_user_id
      AND m.read_at IS NULL;
  ELSE
    SELECT c.request_id
      INTO v_lookup_id
    FROM public.request_conversations c
    WHERE c.id = p_conversation_id;

    UPDATE public.request_messages m
    SET read_at = coalesce(m.read_at, now())
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id <> v_user_id
      AND m.read_at IS NULL;
  END IF;

  UPDATE public.notification_inbox ni
  SET read_at = now()
  WHERE ni.user_id = v_user_id
    AND ni.request_id = v_lookup_id
    AND ni.type = 'new_message'::public.notification_type
    AND ni.read_at IS NULL;
END;
$$;