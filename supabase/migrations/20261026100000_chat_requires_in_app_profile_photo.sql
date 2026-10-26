-- Chat sends require the same in-app profile photo as responding to requests.
--
-- Authoritative state: profiles.avatar_path + profiles.avatar_captured_in_app (set only by
-- confirm_avatar_capture after storage upload). Clients cannot UPDATE those columns
-- (guard_profile_columns). Enforcement uses auth.uid() / assert_authenticated(), never
-- client-supplied user ids.
--
-- Covered paths: send_request_message, begin_request_message_with_attachments,
-- guard_request_message_columns (authenticated text INSERT), and
-- complete_request_message_with_attachments (20261026110000).
-- System lifecycle messages and service-role inserts are unchanged.

CREATE OR REPLACE FUNCTION public.assert_in_app_profile_photo(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.avatar_path IS NOT NULL
      AND p.avatar_captured_in_app
  ) THEN
    RAISE EXCEPTION 'add a profile photo in the app before messaging' USING errcode = '55000';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_in_app_profile_photo(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assert_in_app_profile_photo(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.send_request_message(
  p_conversation_id uuid,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_body text := btrim(p_body);
  v_message_id uuid;
BEGIN
  PERFORM public.assert_in_app_profile_photo(v_user_id);

  IF v_body = '' THEN
    RAISE EXCEPTION 'message cannot be empty' USING errcode = '22023';
  END IF;

  IF char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'message is too long' USING errcode = '22023';
  END IF;

  IF NOT public.request_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
  END IF;

  IF NOT public.conversation_sending_allowed(p_conversation_id) THEN
    RAISE EXCEPTION 'this conversation is read-only' USING errcode = '55000';
  END IF;

  INSERT INTO public.request_messages (
    conversation_id,
    sender_id,
    message_type,
    body
  )
  VALUES (
    p_conversation_id,
    v_user_id,
    'text'::public.conversation_message_type,
    v_body
  )
  RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_request_message_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_actor uuid := (SELECT auth.uid());
BEGIN
  SELECT c.requester_id, c.selected_user_id
    INTO v_requester_id, v_selected_user_id
  FROM public.request_conversations c
  WHERE c.id = new.conversation_id;

  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
  END IF;

  IF new.sender_id NOT IN (v_requester_id, v_selected_user_id) THEN
    RAISE EXCEPTION 'sender must be a conversation participant' USING errcode = '42501';
  END IF;

  IF tg_op = 'INSERT' THEN
    IF new.message_type = 'text'::public.conversation_message_type THEN
      IF v_actor IS NOT NULL AND v_actor IS DISTINCT FROM new.sender_id THEN
        RAISE EXCEPTION 'sender_id must match authenticated user' USING errcode = '42501';
      END IF;

      IF v_actor IS NOT NULL THEN
        PERFORM public.assert_in_app_profile_photo(v_actor);

        IF NOT public.request_conversation_is_accessible(new.conversation_id, v_actor) THEN
          RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
        END IF;

        IF NOT public.conversation_sending_allowed(new.conversation_id) THEN
          RAISE EXCEPTION 'this conversation is read-only' USING errcode = '55000';
        END IF;
      END IF;

      RETURN new;
    END IF;

    IF new.message_type = 'system'::public.conversation_message_type
       AND coalesce(current_setting('request.conversation_system_message', true), '') = '1' THEN
      IF new.metadata IS NULL OR btrim(new.metadata ->> 'lifecycle_key') = '' THEN
        RAISE EXCEPTION 'system lifecycle message requires metadata.lifecycle_key' USING errcode = '22023';
      END IF;
      IF btrim(new.metadata ->> 'event') = '' THEN
        RAISE EXCEPTION 'system message requires metadata.event' USING errcode = '22023';
      END IF;
      RETURN new;
    END IF;

    IF new.message_type = 'system'::public.conversation_message_type
       AND public.request_message_system_insert_allowed() THEN
      IF new.metadata IS NULL OR btrim(new.metadata ->> 'event') = '' THEN
        RAISE EXCEPTION 'system message requires metadata.event' USING errcode = '22023';
      END IF;
      RETURN new;
    END IF;

    RAISE EXCEPTION 'only text messages are supported' USING errcode = '22023';
  END IF;

  IF new.id IS DISTINCT FROM old.id
     OR new.conversation_id IS DISTINCT FROM old.conversation_id
     OR new.sender_id IS DISTINCT FROM old.sender_id
     OR new.message_type IS DISTINCT FROM old.message_type
     OR new.body IS DISTINCT FROM old.body
     OR new.metadata IS DISTINCT FROM old.metadata
     OR new.created_at IS DISTINCT FROM old.created_at
     OR new.updated_at IS DISTINCT FROM old.updated_at
  THEN
    RAISE EXCEPTION 'only read_at may be updated' USING errcode = '55000';
  END IF;

  IF old.sender_id = v_actor THEN
    RAISE EXCEPTION 'sender cannot mark their own message read' USING errcode = '42501';
  END IF;

  IF v_actor IS NOT NULL
     AND NOT public.request_conversation_is_accessible(old.conversation_id, v_actor) THEN
    RAISE EXCEPTION 'not a conversation participant' USING errcode = '42501';
  END IF;

  IF v_actor IS DISTINCT FROM v_requester_id AND v_actor IS DISTINCT FROM v_selected_user_id THEN
    RAISE EXCEPTION 'not a conversation participant' USING errcode = '42501';
  END IF;

  RETURN new;
END;
$$;

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

  PERFORM public.assert_in_app_profile_photo(v_user_id);

  IF NOT public.conversation_sending_allowed(p_conversation_id) THEN
    RAISE EXCEPTION 'this conversation is read-only' USING errcode = '55000';
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
    SELECT value
    FROM jsonb_array_elements(p_planned_attachments)
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
