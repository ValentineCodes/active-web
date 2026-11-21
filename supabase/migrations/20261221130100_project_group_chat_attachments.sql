-- Group chat attachment begin path (reuses conversation-media storage layout).

CREATE OR REPLACE FUNCTION public.begin_request_message_with_attachments(
  p_conversation_id uuid,
  p_body text DEFAULT '',
  p_planned_attachments jsonb DEFAULT '[]'::jsonb,
  p_client_send_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  message_id uuid,
  attachment_id uuid,
  storage_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_body text := left(btrim(p_body), 2000);
  v_message_id uuid;
  v_item jsonb;
  v_attachment_id uuid;
  v_file_name text;
  v_mime_type text;
  v_file_size bigint;
  v_attachment_type public.conversation_attachment_type;
  v_storage_path text;
  v_count integer := 0;
  v_attachment record;
BEGIN
  IF jsonb_typeof(p_planned_attachments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
  END IF;

  IF jsonb_array_length(p_planned_attachments) < 1 THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
  END IF;

  IF jsonb_array_length(p_planned_attachments) > 10 THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
  END IF;

  IF v_body = '' AND jsonb_array_length(p_planned_attachments) < 1 THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
  END IF;

  IF NOT public.request_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
  END IF;

  PERFORM public.assert_in_app_profile_photo(v_user_id);

  IF NOT public.conversation_sending_allowed(p_conversation_id) THEN
    RAISE EXCEPTION 'this conversation is read-only' USING errcode = '55000';
  END IF;

  IF public.project_group_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    INSERT INTO public.project_group_messages (
      conversation_id,
      sender_id,
      message_type,
      body,
      metadata
    )
    VALUES (
      p_conversation_id,
      v_user_id,
      'text'::public.conversation_message_type,
      v_body,
      CASE
        WHEN p_client_send_id IS NULL THEN NULL
        ELSE jsonb_build_object('client_send_id', p_client_send_id::text)
      END
    )
    RETURNING id INTO v_message_id;

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
        p_conversation_id,
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
        p_conversation_id,
        v_user_id,
        v_storage_path,
        v_file_name,
        public.conversation_attachment_normalize_mime(v_mime_type),
        v_file_size,
        v_attachment_type,
        NULL
      );

      message_id := v_message_id;
      attachment_id := v_attachment_id;
      storage_path := v_storage_path;
      RETURN NEXT;
      v_count := v_count + 1;
    END LOOP;

    IF v_count < 1 THEN
      RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
    END IF;

    RETURN;
  END IF;

  IF p_client_send_id IS NOT NULL THEN
    SELECT m.id
    INTO v_message_id
    FROM public.request_messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id = v_user_id
      AND m.message_type = 'text'::public.conversation_message_type
      AND m.metadata @> jsonb_build_object('client_send_id', p_client_send_id::text)
      AND NOT EXISTS (
        SELECT 1
        FROM public.request_message_attachments a
        WHERE a.message_id = m.id
          AND a.uploaded_at IS NOT NULL
      );

    IF v_message_id IS NOT NULL THEN
      FOR v_attachment IN
        SELECT a.id, a.storage_path
        FROM public.request_message_attachments a
        WHERE a.message_id = v_message_id
        ORDER BY a.created_at, a.id
      LOOP
        message_id := v_message_id;
        attachment_id := v_attachment.id;
        storage_path := v_attachment.storage_path;
        RETURN NEXT;
      END LOOP;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.request_messages (
    conversation_id,
    sender_id,
    message_type,
    body,
    metadata
  )
  VALUES (
    p_conversation_id,
    v_user_id,
    'text'::public.conversation_message_type,
    v_body,
    CASE
      WHEN p_client_send_id IS NULL THEN NULL
      ELSE jsonb_build_object('client_send_id', p_client_send_id::text)
    END
  )
  RETURNING id INTO v_message_id;

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
      p_conversation_id,
      v_message_id,
      v_attachment_id,
      coalesce(v_file_name, 'attachment')
    );

    INSERT INTO public.request_message_attachments (
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
      p_conversation_id,
      v_user_id,
      v_storage_path,
      v_file_name,
      public.conversation_attachment_normalize_mime(v_mime_type),
      v_file_size,
      v_attachment_type,
      NULL
    );

    message_id := v_message_id;
    attachment_id := v_attachment_id;
    storage_path := v_storage_path;
    RETURN NEXT;
    v_count := v_count + 1;
  END LOOP;

  IF v_count < 1 THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
  END IF;
END;
$$;