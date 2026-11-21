-- Align project group attachment JSON with request_message_attachments_for_row (PWA parser expects id + created_at).

CREATE OR REPLACE FUNCTION public.project_group_message_attachments_for_row(p_message_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'storage_path', a.storage_path,
        'file_name', a.file_name,
        'mime_type', a.mime_type,
        'file_size', a.file_size,
        'attachment_type', a.attachment_type,
        'created_at', coalesce(a.uploaded_at, a.created_at)
      )
      ORDER BY a.created_at, a.id
    ),
    '[]'::jsonb
  )
  FROM public.project_group_message_attachments a
  WHERE a.message_id = p_message_id
    AND a.uploaded_at IS NOT NULL;
$$;

-- Abort failed project group chat attachment sends (not only formal submission drafts).

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
      IF EXISTS (
        SELECT 1
        FROM public.project_group_message_attachments a
        WHERE a.message_id = p_message_id
          AND a.uploaded_at IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
      END IF;

      DELETE FROM storage.objects o
      USING public.project_group_message_attachments a
      WHERE a.message_id = p_message_id
        AND a.sender_id = v_user_id
        AND o.bucket_id = 'conversation-media'
        AND o.name = a.storage_path;

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

    DELETE FROM storage.objects o
    USING public.project_group_message_attachments a
    WHERE a.message_id = p_message_id
      AND a.sender_id = v_user_id
      AND o.bucket_id = 'conversation-media'
      AND o.name = a.storage_path;

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

  DELETE FROM storage.objects o
  USING public.request_message_attachments a
  WHERE a.message_id = p_message_id
    AND a.sender_id = v_user_id
    AND o.bucket_id = 'conversation-media'
    AND o.name = a.storage_path;

  DELETE FROM public.request_message_attachments a
  WHERE a.message_id = p_message_id
    AND a.sender_id = v_user_id;

  DELETE FROM public.request_messages m
  WHERE m.id = p_message_id
    AND m.sender_id = v_user_id;
END;
$$;