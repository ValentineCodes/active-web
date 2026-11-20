ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.project_messages;

CREATE OR REPLACE FUNCTION public.get_request_message_for_viewer(p_message_id uuid)
RETURNS TABLE(
  message_id uuid,
  sender_id uuid,
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
    FROM public.project_messages m
    WHERE m.id = p_message_id
      AND public.project_conversation_is_accessible(m.conversation_id, v_user_id)
  ) THEN
    RETURN QUERY
    SELECT
      m.id,
      m.sender_id,
      m.message_type,
      m.body,
      coalesce(m.metadata, '{}'::jsonb),
      '[]'::jsonb,
      m.created_at,
      m.read_at
    FROM public.project_messages m
    WHERE m.id = p_message_id;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.sender_id,
    m.message_type,
    m.body,
    m.metadata,
    public.request_message_attachments_for_row(m.id),
    m.created_at,
    m.read_at
  FROM public.request_messages m
  JOIN public.request_conversations c ON c.id = m.conversation_id
  WHERE m.id = p_message_id
    AND public.request_conversation_is_accessible(c.id, v_user_id);
END;
$$;