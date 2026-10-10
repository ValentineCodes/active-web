-- Pre-handshake private chats between requester and individual responders (one thread per response).

ALTER TABLE public.request_conversations
  ADD COLUMN IF NOT EXISTS response_id uuid;

UPDATE public.request_conversations c
SET response_id = h.response_id
FROM public.handshakes h
WHERE h.request_id = c.request_id
  AND h.selected_user_id = c.selected_user_id
  AND c.response_id IS NULL;

ALTER TABLE public.request_conversations
  ALTER COLUMN response_id SET NOT NULL;

ALTER TABLE ONLY public.request_conversations
  DROP CONSTRAINT IF EXISTS request_conversations_request_id_key;

ALTER TABLE ONLY public.request_conversations
  ADD CONSTRAINT request_conversations_response_id_key UNIQUE (response_id);

ALTER TABLE ONLY public.request_conversations
  ADD CONSTRAINT request_conversations_response_id_fkey
  FOREIGN KEY (response_id) REFERENCES public.request_responses (id) ON DELETE RESTRICT;

COMMENT ON TABLE public.request_conversations IS
  'One thread per response; participants are the requester and that responder. Becomes the engagement chat after selection.';

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
        )
      )
  );
$$;

COMMENT ON FUNCTION public.conversation_sending_allowed(uuid) IS
  'True when this conversation accepts new user messages (pre-handshake or active engagement).';

CREATE OR REPLACE FUNCTION public.request_conversation_is_accessible(
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
    JOIN public.request_responses rr ON rr.id = c.response_id
      AND rr.request_id = c.request_id
      AND rr.responder_id = c.selected_user_id
    WHERE c.id = p_conversation_id
      AND p_user_id IN (c.requester_id, c.selected_user_id)
  );
$$;

COMMENT ON FUNCTION public.request_conversation_is_accessible(uuid, uuid) IS
  'True when the user is a party to a response-scoped request conversation.';

CREATE OR REPLACE FUNCTION public.guard_request_conversation_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF tg_op = 'DELETE' THEN
    RAISE EXCEPTION 'request conversations cannot be deleted' USING errcode = '55000';
  END IF;

  IF new.id IS DISTINCT FROM old.id
     OR new.request_id IS DISTINCT FROM old.request_id
     OR new.requester_id IS DISTINCT FROM old.requester_id
     OR new.selected_user_id IS DISTINCT FROM old.selected_user_id
     OR new.response_id IS DISTINCT FROM old.response_id
     OR new.created_at IS DISTINCT FROM old.created_at
  THEN
    RAISE EXCEPTION 'request conversation identity cannot be modified' USING errcode = '55000';
  END IF;

  RETURN new;
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

CREATE OR REPLACE FUNCTION public.abort_request_message_with_attachments(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_conversation_id uuid;
BEGIN
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

  PERFORM set_config('storage.allow_delete_query', 'true', true);

  DELETE FROM storage.objects o
  USING public.request_message_attachments a
  WHERE a.message_id = p_message_id
    AND a.sender_id = v_user_id
    AND o.bucket_id = 'conversation-media'
    AND o.name = a.storage_path;

  PERFORM set_config('storage.allow_delete_query', 'false', true);

  DELETE FROM public.request_message_attachments a
  WHERE a.message_id = p_message_id
    AND a.sender_id = v_user_id;

  DELETE FROM public.request_messages m
  WHERE m.id = p_message_id
    AND m.sender_id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.append_request_conversation_system_message(
  p_request_id uuid,
  p_lifecycle_key text,
  p_body text,
  p_sender_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_conversation_id uuid;
  v_selected_user_id uuid;
BEGIN
  IF p_request_id IS NULL
     OR p_lifecycle_key IS NULL
     OR btrim(p_lifecycle_key) = ''
     OR p_body IS NULL
     OR btrim(p_body) = ''
     OR p_sender_id IS NULL THEN
    RETURN;
  END IF;

  SELECT r.selected_user_id
    INTO v_selected_user_id
  FROM public.requests r
  WHERE r.id = p_request_id;

  IF v_selected_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT c.id
    INTO v_conversation_id
  FROM public.request_conversations c
  WHERE c.request_id = p_request_id
    AND c.selected_user_id = v_selected_user_id
    AND p_sender_id IN (c.requester_id, c.selected_user_id);

  IF v_conversation_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.request_messages m
    WHERE m.conversation_id = v_conversation_id
      AND m.message_type = 'system'::public.conversation_message_type
      AND m.metadata ->> 'lifecycle_key' = p_lifecycle_key
  ) THEN
    RETURN;
  END IF;

  PERFORM set_config('request.conversation_system_message', '1', true);

  INSERT INTO public.request_messages (
    conversation_id,
    sender_id,
    message_type,
    body,
    metadata
  )
  VALUES (
    v_conversation_id,
    p_sender_id,
    'system'::public.conversation_message_type,
    btrim(p_body),
    jsonb_build_object(
      'event',
      'request_lifecycle',
      'lifecycle_key',
      p_lifecycle_key
    )
  );

  PERFORM set_config('request.conversation_system_message', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_request_conversation_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_helper_name text;
  v_helper_first text;
  v_requester_id uuid;
  v_selected_user_id uuid;
BEGIN
  IF old.status IS NOT DISTINCT FROM new.status THEN
    RETURN new;
  END IF;

  v_selected_user_id := new.selected_user_id;
  v_requester_id := new.requester_id;

  IF v_selected_user_id IS NULL THEN
    RETURN new;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.request_conversations c
    WHERE c.request_id = new.id
      AND c.selected_user_id = v_selected_user_id
  ) THEN
    RETURN new;
  END IF;

  SELECT p.display_name
    INTO v_helper_name
  FROM public.profiles p
  WHERE p.id = v_selected_user_id;

  v_helper_first := coalesce(public.display_first_name(v_helper_name), 'Your helper');

  IF new.status = 'completion_pending'::public.request_status
        AND old.status = ANY (
          ARRAY[
            'accepted'::public.request_status,
            'in_progress'::public.request_status
          ]
        ) THEN
    PERFORM public.append_request_conversation_system_message(
      new.id,
      'lifecycle:' || new.id::text || ':completion_pending',
      format('%s marked the request as complete.', v_helper_first),
      v_selected_user_id
    );
  ELSIF new.status = 'cancelled'::public.request_status THEN
    PERFORM public.append_request_conversation_system_message(
      new.id,
      'lifecycle:' || new.id::text || ':cancelled',
      'This request was cancelled.',
      v_requester_id
    );
  ELSIF new.status = 'expired'::public.request_status THEN
    PERFORM public.append_request_conversation_system_message(
      new.id,
      'lifecycle:' || new.id::text || ':expired',
      'This request expired.',
      v_requester_id
    );
  ELSIF new.status = 'disputed'::public.request_status THEN
    PERFORM public.append_request_conversation_system_message(
      new.id,
      'lifecycle:' || new.id::text || ':disputed',
      'A problem was reported on this request.',
      v_requester_id
    );
  END IF;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_request_conversation(
  p_request_id uuid,
  p_requester_id uuid,
  p_selected_user_id uuid,
  p_response_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request public.requests%rowtype;
  v_conversation_id uuid;
  v_helper_name text;
  v_helper_first text;
BEGIN
  IF p_request_id IS NULL
     OR p_requester_id IS NULL
     OR p_selected_user_id IS NULL
     OR p_response_id IS NULL THEN
    RAISE EXCEPTION 'conversation participants are required' USING errcode = '22023';
  END IF;

  IF p_requester_id = p_selected_user_id THEN
    RAISE EXCEPTION 'conversation requires two distinct participants' USING errcode = '22023';
  END IF;

  SELECT *
    INTO v_request
  FROM public.requests r
  WHERE r.id = p_request_id;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_request.requester_id IS DISTINCT FROM p_requester_id
     OR v_request.selected_user_id IS DISTINCT FROM p_selected_user_id THEN
    RAISE EXCEPTION 'conversation does not match request selection' USING errcode = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.handshakes h
    WHERE h.request_id = p_request_id
      AND h.requester_id = p_requester_id
      AND h.selected_user_id = p_selected_user_id
      AND h.response_id = p_response_id
  ) THEN
    RAISE EXCEPTION 'conversation requires a completed selection handshake' USING errcode = '55000';
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
    p_request_id,
    p_requester_id,
    p_selected_user_id,
    p_response_id,
    now(),
    now()
  )
  ON CONFLICT (request_id, selected_user_id) DO NOTHING;

  SELECT c.id
    INTO v_conversation_id
  FROM public.request_conversations c
  WHERE c.request_id = p_request_id
    AND c.selected_user_id = p_selected_user_id;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation could not be created' USING errcode = '55000';
  END IF;

  SELECT p.display_name
    INTO v_helper_name
  FROM public.profiles p
  WHERE p.id = p_selected_user_id;

  v_helper_first := coalesce(public.display_first_name(v_helper_name), 'Your helper');

  PERFORM public.append_request_conversation_system_message(
    p_request_id,
    'lifecycle:' || p_request_id::text || ':selected',
    format('%s was selected to help with this request.', v_helper_first),
    p_requester_id
  );

  RETURN v_conversation_id;
END;
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

  IF EXISTS (SELECT 1 FROM public.handshakes h WHERE h.request_id = v_request_id) THEN
    RAISE EXCEPTION 'this request already has a selected helper' USING errcode = '55000';
  END IF;

  IF v_request_status NOT IN ('posted'::public.request_status, 'searching'::public.request_status) THEN
    RAISE EXCEPTION 'this request is no longer open for discussion' USING errcode = '55000';
  END IF;

  IF v_expires_at <= now() THEN
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
      'Discussion started',
      format('%s wants to discuss "%s" before choosing.', v_requester_first, v_request_title),
      format('/conversation/%s', v_conversation_id),
      v_request_id,
      p_response_id,
      NULL,
      NULL,
      v_requester_id,
      jsonb_build_object('conversation_id', v_conversation_id, 'pre_handshake', true),
      true
    );
  END IF;

  RETURN v_conversation_id;
END;
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
    public.conversation_sending_allowed(c.id),
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
    public.conversation_sending_allowed(c.id),
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
    public.conversation_sending_allowed(c.id),
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
    AND public.request_conversation_is_accessible(c.id, rr.responder_id);
$$;

CREATE OR REPLACE FUNCTION public.new_message_notification_body(
  p_message_id uuid,
  p_body text,
  p_sender_first text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_image integer := 0;
  v_video integer := 0;
  v_file integer := 0;
BEGIN
  SELECT
    count(*) FILTER (WHERE a.attachment_type = 'image'::public.conversation_attachment_type),
    count(*) FILTER (WHERE a.attachment_type = 'video'::public.conversation_attachment_type),
    count(*) FILTER (WHERE a.attachment_type = 'file'::public.conversation_attachment_type)
    INTO v_image, v_video, v_file
  FROM public.request_message_attachments a
  WHERE a.message_id = p_message_id
    AND a.uploaded_at IS NOT NULL;

  IF v_image + v_video + v_file = 0 THEN
    RETURN format('%s sent you a message.', p_sender_first);
  END IF;

  IF btrim(coalesce(p_body, '')) <> '' THEN
    RETURN format('%s sent you a message.', p_sender_first);
  END IF;

  IF v_image > 0 AND v_video = 0 AND v_file = 0 THEN
    RETURN format('%s sent you a photo.', p_sender_first);
  END IF;

  IF v_video > 0 AND v_image = 0 AND v_file = 0 THEN
    RETURN format('%s sent you a video.', p_sender_first);
  END IF;

  IF v_file > 0 AND v_image = 0 AND v_video = 0 THEN
    RETURN format('%s sent you a file.', p_sender_first);
  END IF;

  RETURN format('%s sent you a message.', p_sender_first);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_request_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF new.message_type = 'system'::public.conversation_message_type THEN
    RETURN new;
  END IF;

  IF coalesce(new.metadata ->> 'client_send_id', '') <> '' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.request_message_attachments a
      WHERE a.message_id = new.id
        AND a.uploaded_at IS NOT NULL
    ) THEN
      RETURN new;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.request_message_attachments a
    WHERE a.message_id = new.id
      AND a.uploaded_at IS NULL
  ) THEN
    RETURN new;
  END IF;

  PERFORM public.notify_request_message_dispatch(new);
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_request_message_dispatch(p_message public.request_messages)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_request_id uuid;
  v_recipient_id uuid;
  v_sender_name text;
  v_sender_first text;
  v_body text;
BEGIN
  IF p_message.message_type = 'system'::public.conversation_message_type THEN
    RETURN;
  END IF;

  SELECT c.requester_id, c.selected_user_id, c.request_id
    INTO v_requester_id, v_selected_user_id, v_request_id
  FROM public.request_conversations c
  WHERE c.id = p_message.conversation_id;

  IF v_request_id IS NULL THEN
    RETURN;
  END IF;

  IF p_message.sender_id = v_requester_id THEN
    v_recipient_id := v_selected_user_id;
  ELSIF p_message.sender_id = v_selected_user_id THEN
    v_recipient_id := v_requester_id;
  ELSE
    RETURN;
  END IF;

  IF v_recipient_id IS NULL OR v_recipient_id = p_message.sender_id THEN
    RETURN;
  END IF;

  IF public.recipient_is_viewing_conversation(v_recipient_id, p_message.conversation_id) THEN
    RETURN;
  END IF;

  SELECT p.display_name
    INTO v_sender_name
  FROM public.profiles p
  WHERE p.id = p_message.sender_id;

  v_sender_first := coalesce(public.display_first_name(v_sender_name), 'Someone');
  v_body := public.new_message_notification_body(p_message.id, p_message.body, v_sender_first);

  PERFORM public.create_notification(
    v_recipient_id,
    'request_message:' || p_message.id::text,
    'new_message'::public.notification_type,
    'New message',
    v_body,
    format('/conversation/%s', p_message.conversation_id),
    v_request_id,
    NULL,
    NULL,
    NULL,
    p_message.sender_id,
    jsonb_build_object('message_id', p_message.id, 'conversation_id', p_message.conversation_id),
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_response(p_response_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_request_id uuid;
  v_selected_user_id uuid;
  v_request_status public.request_status;
  v_response_status public.response_status;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_request_expires_at timestamptz;
  v_offered_amount numeric;
  v_quoted_amount numeric;
  v_agreed_provider_amount numeric;
  v_accepted uuid;
  v_locked_request_id uuid;
  v_requester_name text;
  v_requester_first text;
  v_handshake_key text;
BEGIN
  SELECT rr.request_id
    INTO v_request_id
  FROM public.request_responses rr
  JOIN public.requests r ON r.id = rr.request_id
  WHERE rr.id = p_response_id
    AND r.requester_id = v_user_id;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'response not found' USING errcode = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.handshakes h
    WHERE h.request_id = v_request_id
      AND h.response_id = p_response_id
  ) THEN
    RETURN v_request_id;
  END IF;

  SELECT r.status, r.payment_status, r.requester_id, r.expires_at, r.offered_amount
    INTO v_request_status, v_payment, v_requester_id, v_request_expires_at, v_offered_amount
  FROM public.requests r
  WHERE r.id = v_request_id
  FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.handshakes h WHERE h.request_id = v_request_id) THEN
    RAISE EXCEPTION 'someone is already helping on this request' USING errcode = '55000';
  END IF;

  IF v_request_status <> 'posted' THEN
    RAISE EXCEPTION 'this request is no longer open for selection' USING errcode = '55000';
  END IF;

  IF v_request_expires_at <= now() THEN
    RAISE EXCEPTION 'this request is no longer open for selection' USING errcode = '55000';
  END IF;

  SELECT rr.request_id, rr.responder_id, rr.status, rr.quoted_amount
    INTO v_locked_request_id, v_selected_user_id, v_response_status, v_quoted_amount
  FROM public.request_responses rr
  WHERE rr.id = p_response_id
  FOR UPDATE;

  IF v_locked_request_id IS DISTINCT FROM v_request_id
     OR v_response_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'this response is no longer available' USING errcode = '55000';
  END IF;

  v_agreed_provider_amount := coalesce(nullif(v_quoted_amount, 0), v_offered_amount);

  IF v_agreed_provider_amount IS NULL OR v_agreed_provider_amount <= 0 THEN
    RAISE EXCEPTION 'this request has no agreed payment amount' USING errcode = '55000';
  END IF;

  PERFORM pg_advisory_xact_lock(4242, hashtext(v_selected_user_id::text));

  PERFORM 1
  FROM public.requests existing
  WHERE existing.selected_user_id = v_selected_user_id
    AND existing.status = ANY (public.attending_request_statuses())
  FOR UPDATE;

  PERFORM public.assert_responder_available_for_selection(v_selected_user_id, v_request_id);

  v_handshake_key := 'handshake:' || v_request_id::text;

  IF v_payment = 'not_required'::public.payment_status THEN
    PERFORM public.lock_request_escrow_for_amount(
      v_request_id,
      v_agreed_provider_amount,
      v_handshake_key
    );
  ELSIF v_payment = 'locked'::public.payment_status THEN
    PERFORM public.align_request_escrow_to_agreed_amount(
      v_request_id,
      v_agreed_provider_amount,
      v_handshake_key
    );
  ELSE
    RAISE EXCEPTION 'this request cannot be accepted for payment' USING errcode = '55000';
  END IF;

  UPDATE public.request_responses
  SET status = 'accepted', resolved_at = now()
  WHERE id = p_response_id
    AND status = 'pending'
  RETURNING id INTO v_accepted;

  IF v_accepted IS NULL THEN
    RAISE EXCEPTION 'this response is no longer available' USING errcode = '55000';
  END IF;

  UPDATE public.request_responses
  SET status = 'declined', resolved_at = now()
  WHERE request_id = v_request_id
    AND id <> p_response_id
    AND status = 'pending';

  UPDATE public.requests
  SET status = 'accepted',
      accepted_at = now(),
      accepted_response_id = p_response_id,
      selected_user_id = v_selected_user_id,
      agreed_provider_amount = v_agreed_provider_amount
  WHERE id = v_request_id
    AND status = 'posted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'this request is no longer open for selection' USING errcode = '55000';
  END IF;

  PERFORM public.set_user_attendance(v_selected_user_id, v_request_id);

  INSERT INTO public.handshakes (request_id, response_id, requester_id, selected_user_id)
  VALUES (v_request_id, p_response_id, v_requester_id, v_selected_user_id);

  PERFORM public.ensure_request_conversation(
    v_request_id,
    v_requester_id,
    v_selected_user_id,
    p_response_id
  );

  SELECT p.display_name
    INTO v_requester_name
  FROM public.profiles p
  WHERE p.id = v_requester_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'them');

  PERFORM public.create_notification(
    v_selected_user_id,
    'request:' || v_request_id::text || ':accepted',
    'response_accepted'::public.notification_type,
    format('You''re helping %s now', v_requester_first),
    'Open the request to chat, see contact details, and where to meet.',
    format('/engagement/%s', v_request_id),
    v_request_id,
    p_response_id,
    NULL,
    NULL,
    v_requester_id,
    NULL,
    true
  );

  PERFORM public.apply_payment_transition(
    v_request_id,
    'pending'::public.payment_status,
    v_handshake_key
  );

  PERFORM public.notify_responders_not_chosen(v_request_id, p_response_id);

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.conversation_sending_allowed(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_sending_allowed(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.conversation_sending_allowed(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.open_pre_handshake_conversation(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.open_pre_handshake_conversation(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.open_pre_handshake_conversation(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.resolve_request_conversation_for_viewer(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_request_conversation_for_viewer(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_request_conversation_for_viewer(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_responder_pre_handshake_conversation(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_responder_pre_handshake_conversation(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_responder_pre_handshake_conversation(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.ensure_request_conversation(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_request_conversation(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_request_conversation(uuid, uuid, uuid, uuid) TO service_role;

DROP FUNCTION IF EXISTS public.ensure_request_conversation(uuid, uuid, uuid);
