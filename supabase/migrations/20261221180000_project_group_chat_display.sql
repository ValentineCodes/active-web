-- PWA: project group chat header members + per-message sender names.

CREATE OR REPLACE FUNCTION public.list_project_group_conversation_members(p_conversation_id uuid)
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  IF NOT public.project_group_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'conversation not found' USING errcode = 'P0002';
  END IF;

  RETURN QUERY
  SELECT m.user_id, nullif(btrim(prof.display_name), '')
  FROM public.project_group_conversation_members m
  JOIN public.profiles prof ON prof.id = m.user_id
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.joined_at ASC, prof.display_name ASC, m.user_id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_project_group_conversation_members(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.list_request_messages(uuid, integer, timestamptz);

CREATE OR REPLACE FUNCTION public.list_request_messages(
  p_conversation_id uuid,
  p_limit integer DEFAULT 40,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE(
  message_id uuid,
  sender_id uuid,
  sender_display_name text,
  message_type public.conversation_message_type,
  body text,
  metadata jsonb,
  attachments jsonb,
  created_at timestamptz,
  read_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_limit integer := greatest(1, least(coalesce(p_limit, 40), 100));
BEGIN
  IF public.project_group_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    RETURN QUERY
    SELECT
      m.id,
      m.sender_id,
      nullif(btrim(prof.display_name), ''),
      m.message_type,
      m.body,
      coalesce(m.metadata, '{}'::jsonb),
      public.project_group_message_attachments_for_row(m.id),
      m.created_at,
      m.read_at
    FROM public.project_group_messages m
    JOIN public.profiles prof ON prof.id = m.sender_id
    WHERE m.conversation_id = p_conversation_id
      AND (p_before IS NULL OR m.created_at < p_before)
      AND (
        m.sender_id = v_user_id
        OR NOT (
          coalesce(m.metadata->>'draft_submission', '') = 'true'
          AND NOT (m.metadata ? 'submission_id')
        )
      )
    ORDER BY m.created_at DESC
    LIMIT v_limit;
    RETURN;
  END IF;

  IF public.project_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    RETURN QUERY
    SELECT
      m.id,
      m.sender_id,
      nullif(btrim(prof.display_name), ''),
      m.message_type,
      m.body,
      coalesce(m.metadata, '{}'::jsonb),
      '[]'::jsonb,
      m.created_at,
      m.read_at
    FROM public.project_messages m
    JOIN public.profiles prof ON prof.id = m.sender_id
    WHERE m.conversation_id = p_conversation_id
      AND (p_before IS NULL OR m.created_at < p_before)
    ORDER BY m.created_at DESC
    LIMIT v_limit;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.sender_id,
    nullif(btrim(prof.display_name), ''),
    m.message_type,
    m.body,
    m.metadata,
    public.request_message_attachments_for_row(m.id),
    m.created_at,
    m.read_at
  FROM public.request_conversations c
  JOIN public.request_messages m ON m.conversation_id = c.id
  JOIN public.profiles prof ON prof.id = m.sender_id
  WHERE c.id = p_conversation_id
    AND public.request_conversation_is_accessible(c.id, v_user_id)
    AND (p_before IS NULL OR m.created_at < p_before)
  ORDER BY m.created_at DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_request_messages(uuid, integer, timestamptz) TO authenticated;

DROP FUNCTION IF EXISTS public.get_request_message_for_viewer(uuid);

CREATE OR REPLACE FUNCTION public.get_request_message_for_viewer(p_message_id uuid)
RETURNS TABLE(
  message_id uuid,
  sender_id uuid,
  sender_display_name text,
  message_type public.conversation_message_type,
  body text,
  metadata jsonb,
  attachments jsonb,
  created_at timestamptz,
  read_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.project_group_messages m
    WHERE m.id = p_message_id
      AND public.project_group_conversation_is_accessible(m.conversation_id, v_user_id)
  ) THEN
    RETURN QUERY
    SELECT
      m.id,
      m.sender_id,
      nullif(btrim(prof.display_name), ''),
      m.message_type,
      m.body,
      coalesce(m.metadata, '{}'::jsonb),
      public.project_group_message_attachments_for_row(m.id),
      m.created_at,
      m.read_at
    FROM public.project_group_messages m
    JOIN public.profiles prof ON prof.id = m.sender_id
    WHERE m.id = p_message_id;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_messages m
    WHERE m.id = p_message_id
      AND public.project_conversation_is_accessible(m.conversation_id, v_user_id)
  ) THEN
    RETURN QUERY
    SELECT
      m.id,
      m.sender_id,
      nullif(btrim(prof.display_name), ''),
      m.message_type,
      m.body,
      coalesce(m.metadata, '{}'::jsonb),
      '[]'::jsonb,
      m.created_at,
      m.read_at
    FROM public.project_messages m
    JOIN public.profiles prof ON prof.id = m.sender_id
    WHERE m.id = p_message_id;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.sender_id,
    nullif(btrim(prof.display_name), ''),
    m.message_type,
    m.body,
    m.metadata,
    public.request_message_attachments_for_row(m.id),
    m.created_at,
    m.read_at
  FROM public.request_messages m
  JOIN public.request_conversations c ON c.id = m.conversation_id
  JOIN public.profiles prof ON prof.id = m.sender_id
  WHERE m.id = p_message_id
    AND public.request_conversation_is_accessible(c.id, v_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_request_message_for_viewer(uuid) TO authenticated;