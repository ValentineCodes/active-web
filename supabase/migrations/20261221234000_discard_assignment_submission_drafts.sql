-- Drop in-flight formal submission drafts so workers can restart (message-only, new files, etc.).

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
    DELETE FROM storage.objects o
    USING public.project_group_message_attachments a
    WHERE a.message_id = v_draft_id
      AND a.sender_id = v_user_id
      AND o.bucket_id = 'conversation-media'
      AND o.name = a.storage_path;

    DELETE FROM public.project_group_message_attachments a
    WHERE a.message_id = v_draft_id
      AND a.sender_id = v_user_id;

    DELETE FROM public.project_group_messages m
    WHERE m.id = v_draft_id
      AND m.sender_id = v_user_id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.discard_project_assignment_submission_drafts(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.begin_project_assignment_submission(
  p_assignment_id uuid,
  p_milestone_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_planned_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(
  message_id uuid,
  conversation_id uuid,
  attachment_id uuid,
  storage_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_assignment public.project_assignments%rowtype;
  v_conversation_id uuid;
  v_message_id uuid;
  v_body text := left(btrim(coalesce(p_note, '')), 2000);
  v_item jsonb;
  v_attachment_id uuid;
  v_file_name text;
  v_mime_type text;
  v_file_size bigint;
  v_attachment_type public.conversation_attachment_type;
  v_storage_path text;
  v_terms_title text;
  v_milestone_title text;
  v_planned_count integer;
BEGIN
  IF jsonb_typeof(p_planned_attachments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
  END IF;

  v_planned_count := jsonb_array_length(p_planned_attachments);

  IF v_planned_count > 10 THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
  END IF;

  IF v_planned_count < 1
     AND nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Add a message or at least one file' USING errcode = '22023';
  END IF;

  PERFORM public.project_assignment_submission_assert_may_submit(
    p_assignment_id,
    v_user_id,
    p_milestone_id
  );

  SELECT * INTO v_assignment
  FROM public.project_assignments
  WHERE id = p_assignment_id;

  v_conversation_id := public.ensure_project_group_conversation(v_assignment.project_id);
  PERFORM public.add_project_group_conversation_member(
    v_assignment.project_id,
    v_user_id,
    'worker'::public.project_group_member_role
  );

  IF NOT public.project_group_conversation_is_accessible(v_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
  END IF;

  PERFORM public.assert_in_app_profile_photo(v_user_id);

  PERFORM public.discard_project_assignment_submission_drafts(p_assignment_id, p_milestone_id);

  SELECT t.title INTO v_terms_title
  FROM public.project_assignment_terms t
  WHERE t.id = v_assignment.active_terms_id;

  IF p_milestone_id IS NOT NULL THEN
    SELECT m.title INTO v_milestone_title
    FROM public.project_assignment_milestones m
    WHERE m.id = p_milestone_id;
  END IF;

  IF v_body = '' THEN
    v_body := format(
      'Submitted work for %s%s',
      coalesce(v_terms_title, 'assignment'),
      CASE WHEN v_milestone_title IS NOT NULL THEN format(' — %s', v_milestone_title) ELSE '' END
    );
  END IF;

  INSERT INTO public.project_group_messages (
    conversation_id,
    sender_id,
    message_type,
    body,
    metadata
  )
  VALUES (
    v_conversation_id,
    v_user_id,
    'text'::public.conversation_message_type,
    v_body,
    jsonb_strip_nulls(
      jsonb_build_object(
        'draft_submission', true,
        'assignment_id', p_assignment_id::text,
        'milestone_id', p_milestone_id::text,
        'assignment_title', coalesce(v_terms_title, ''),
        'milestone_title', v_milestone_title
      )
    )
  )
  RETURNING id INTO v_message_id;

  IF v_planned_count < 1 THEN
    message_id := v_message_id;
    conversation_id := v_conversation_id;
    attachment_id := NULL;
    storage_path := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_planned_attachments)
  LOOP
    v_file_name := nullif(btrim(v_item ->> 'file_name'), '');
    v_mime_type := nullif(btrim(v_item ->> 'mime_type'), '');
    v_attachment_type := (v_item ->> 'attachment_type')::public.conversation_attachment_type;

    IF v_mime_type IS NULL OR v_attachment_type IS NULL THEN
      RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
    END IF;

    IF v_item ? 'file_size' AND v_item ->> 'file_size' IS NOT NULL THEN
      v_file_size := (v_item ->> 'file_size')::bigint;
    ELSE
      v_file_size := NULL;
    END IF;

    PERFORM public.conversation_attachment_validate_planned(
      v_file_name,
      v_mime_type,
      v_file_size,
      v_attachment_type
    );

    v_attachment_id := gen_random_uuid();
    v_storage_path := public.conversation_chat_storage_path(
      v_user_id,
      v_conversation_id,
      v_message_id,
      v_attachment_id,
      coalesce(v_file_name, 'attachment')
    );

    INSERT INTO public.project_group_message_attachments (
      id,
      message_id,
      conversation_id,
      sender_id,
      storage_path,
      file_name,
      mime_type,
      file_size,
      attachment_type,
      uploaded_at
    )
    VALUES (
      v_attachment_id,
      v_message_id,
      v_conversation_id,
      v_user_id,
      v_storage_path,
      v_file_name,
      public.conversation_attachment_normalize_mime(v_mime_type),
      v_file_size,
      v_attachment_type,
      NULL
    );

    message_id := v_message_id;
    conversation_id := v_conversation_id;
    attachment_id := v_attachment_id;
    storage_path := v_storage_path;
    RETURN NEXT;
  END LOOP;
END;
$$;