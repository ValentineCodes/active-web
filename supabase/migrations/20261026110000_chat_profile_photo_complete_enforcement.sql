-- Attachment completion cannot publish a chat message without in-app profile photo.

COMMENT ON FUNCTION public.assert_in_app_profile_photo(uuid) IS
  'Requires profiles.avatar_path and avatar_captured_in_app (set only via confirm_avatar_capture). '
  'Raises SQLSTATE 55000 with message ''add a profile photo in the app before messaging''.';

CREATE OR REPLACE FUNCTION public.complete_request_message_with_attachments(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_conversation_id uuid;
  v_attachment record;
  v_storage_mime text;
  v_storage_size bigint;
  v_kind public.conversation_attachment_type;
BEGIN
  PERFORM public.assert_in_app_profile_photo(v_user_id);

  SELECT m.conversation_id
    INTO v_conversation_id
  FROM public.request_messages m
  WHERE m.id = p_message_id
    AND m.sender_id = v_user_id
    AND m.message_type = 'text'::public.conversation_message_type;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '42501';
  END IF;

  IF NOT public.request_conversation_is_accessible(v_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.request_message_attachments a
    WHERE a.message_id = p_message_id
      AND a.uploaded_at IS NULL
  ) THEN
    RETURN;
  END IF;

  FOR v_attachment IN
    SELECT a.id, a.storage_path, a.mime_type, a.attachment_type, a.file_size
    FROM public.request_message_attachments a
    WHERE a.message_id = p_message_id
      AND a.sender_id = v_user_id
      AND a.uploaded_at IS NULL
  LOOP
    SELECT
      coalesce(
        nullif(btrim(o.metadata ->> 'mimetype'), ''),
        nullif(btrim(o.metadata ->> 'contentType'), '')
      ),
      coalesce(
        nullif(btrim(o.metadata ->> 'size'), '')::bigint,
        nullif(btrim(o.metadata ->> 'contentLength'), '')::bigint
      )
      INTO v_storage_mime, v_storage_size
    FROM storage.objects o
    WHERE o.bucket_id = 'conversation-media'
      AND o.name = v_attachment.storage_path;

    IF v_storage_mime IS NULL THEN
      RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
    END IF;

    v_storage_size := coalesce(v_storage_size, v_attachment.file_size);

    v_kind := public.conversation_attachment_validate_stored(
      v_storage_mime,
      v_storage_size,
      v_attachment.attachment_type
    );

    UPDATE public.request_message_attachments a
    SET
      uploaded_at = now(),
      mime_type = public.conversation_attachment_normalize_mime(v_storage_mime),
      attachment_type = v_kind,
      file_size = v_storage_size
    WHERE a.id = v_attachment.id;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM public.request_message_attachments a
    WHERE a.message_id = p_message_id
      AND a.uploaded_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
  END IF;

  PERFORM public.notify_request_message_manual(p_message_id);
END;
$$;
