-- Supabase Storage blocks direct DELETE on storage.objects; drop rows + message only.

CREATE OR REPLACE FUNCTION public.discard_project_assignment_submission_drafts(
  p_assignment_id uuid,
  p_milestone_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_conversation_id uuid;
  v_draft_id uuid;
BEGIN
  SELECT public.ensure_project_group_conversation(a.project_id)
  INTO v_conversation_id
  FROM public.project_assignments a
  WHERE a.id = p_assignment_id
    AND a.worker_id = v_user_id;

  IF v_conversation_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_draft_id IN
    SELECT m.id
    FROM public.project_group_messages m
    WHERE m.conversation_id = v_conversation_id
      AND m.sender_id = v_user_id
      AND coalesce(m.metadata->>'draft_submission', '') = 'true'
      AND NOT (m.metadata ? 'submission_id')
      AND (m.metadata->>'assignment_id')::uuid = p_assignment_id
      AND (
        (p_milestone_id IS NULL AND nullif(m.metadata->>'milestone_id', '') IS NULL)
        OR (m.metadata->>'milestone_id')::uuid = p_milestone_id
      )
  LOOP
    DELETE FROM public.project_group_message_attachments a
    WHERE a.message_id = v_draft_id
      AND a.sender_id = v_user_id;

    DELETE FROM public.project_group_messages m
    WHERE m.id = v_draft_id
      AND m.sender_id = v_user_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.abort_request_message_with_attachments(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_conversation_id uuid;
  v_metadata jsonb;
BEGIN
  SELECT m.conversation_id, coalesce(m.metadata, '{}'::jsonb)
  INTO v_conversation_id, v_metadata
  FROM public.project_group_messages m
  WHERE m.id = p_message_id
    AND m.sender_id = v_user_id;

  IF v_conversation_id IS NOT NULL THEN
    IF NOT public.request_conversation_is_accessible(v_conversation_id, v_user_id) THEN
      RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
    END IF;

    IF coalesce(v_metadata->>'draft_submission', '') = 'true'
       AND NOT (v_metadata ? 'submission_id') THEN
      DELETE FROM public.project_group_message_attachments a
      WHERE a.message_id = p_message_id
        AND a.sender_id = v_user_id;

      DELETE FROM public.project_group_messages m
      WHERE m.id = p_message_id
        AND m.sender_id = v_user_id;

      RETURN;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.project_group_message_attachments a
      WHERE a.message_id = p_message_id
        AND a.uploaded_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
    END IF;

    DELETE FROM public.project_group_message_attachments a
    WHERE a.message_id = p_message_id
      AND a.sender_id = v_user_id;

    DELETE FROM public.project_group_messages m
    WHERE m.id = p_message_id
      AND m.sender_id = v_user_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.project_group_message_attachments a
        WHERE a.message_id = p_message_id
      );

    RETURN;
  END IF;

  SELECT m.conversation_id
  INTO v_conversation_id
  FROM public.request_messages m
  WHERE m.id = p_message_id
    AND m.sender_id = v_user_id
    AND m.message_type = 'text'::public.conversation_message_type;

  IF v_conversation_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.request_conversation_is_accessible(v_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.request_message_attachments a
    WHERE a.message_id = p_message_id
      AND a.uploaded_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
  END IF;

  DELETE FROM public.request_message_attachments a
  WHERE a.message_id = p_message_id;

  DELETE FROM public.request_messages m
  WHERE m.id = p_message_id
    AND m.sender_id = v_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.request_message_attachments a WHERE a.message_id = p_message_id
    );
END;
$$;