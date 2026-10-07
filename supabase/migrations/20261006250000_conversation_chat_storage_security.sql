-- Secure chat storage paths and RLS tied to request_message_attachments rows.

ALTER TABLE "public"."request_message_attachments"
  ADD COLUMN IF NOT EXISTS "uploaded_at" timestamp with time zone;

COMMENT ON COLUMN "public"."request_message_attachments"."uploaded_at" IS
  'Set when the object exists in conversation-media; null while upload is in progress.';

CREATE OR REPLACE FUNCTION "public"."sanitize_chat_attachment_filename"("p_file_name" "text")
RETURNS "text"
  LANGUAGE "sql"
  IMMUTABLE
  SET "search_path" TO ''
  AS $$
  select coalesce(
    nullif(
      regexp_replace(
        regexp_replace(btrim(coalesce(p_file_name, '')), '[\\/]+', '_', 'g'),
        '[^a-zA-Z0-9._-]+',
        '_',
        'g'
      ),
      ''
    ),
    'attachment'
  );
$$;

ALTER FUNCTION "public"."sanitize_chat_attachment_filename"("p_file_name" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."conversation_chat_storage_path"(
  "p_user_id" "uuid",
  "p_conversation_id" "uuid",
  "p_message_id" "uuid",
  "p_attachment_id" "uuid",
  "p_file_name" "text"
) RETURNS "text"
  LANGUAGE "sql"
  IMMUTABLE
  SET "search_path" TO ''
  AS $$
  select format(
    '%s/chat/%s/%s/%s-%s',
    p_user_id::text,
    p_conversation_id::text,
    p_message_id::text,
    p_attachment_id::text,
    public.sanitize_chat_attachment_filename(p_file_name)
  );
$$;

ALTER FUNCTION "public"."conversation_chat_storage_path"(
  "p_user_id" "uuid",
  "p_conversation_id" "uuid",
  "p_message_id" "uuid",
  "p_attachment_id" "uuid",
  "p_file_name" "text"
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."conversation_media_path_is_valid"(
  "p_user_id" "uuid",
  "p_conversation_id" "uuid",
  "p_storage_path" "text"
) RETURNS boolean
  LANGUAGE "sql"
  STABLE
  SET "search_path" TO ''
  AS $$
  select exists (
    select 1
    from public.request_message_attachments a
    where a.storage_path = p_storage_path
      and a.sender_id = p_user_id
      and a.conversation_id = p_conversation_id
      and split_part(p_storage_path, '/', 1) = p_user_id::text
      and split_part(p_storage_path, '/', 2) = 'chat'
      and split_part(p_storage_path, '/', 3) = p_conversation_id::text
      and split_part(p_storage_path, '/', 4) = a.message_id::text
      and split_part(p_storage_path, '/', 5) like a.id::text || '-%'
  );
$$;

CREATE OR REPLACE FUNCTION "public"."can_read_conversation_media"("p_name" "text") RETURNS boolean
  LANGUAGE "sql"
  STABLE
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  select exists (
    select 1
    from public.request_message_attachments a
    where a.storage_path = p_name
      and a.uploaded_at is not null
      and public.request_conversation_is_accessible(
        a.conversation_id,
        (select auth.uid())
      )
  )
  or (
    (storage.foldername(p_name))[2] = 'conversations'
    and public.request_conversation_is_accessible(
      ((storage.foldername(p_name))[3])::uuid,
      (select auth.uid())
    )
  );
$$;

CREATE OR REPLACE FUNCTION "public"."can_write_conversation_media"("p_name" "text") RETURNS boolean
  LANGUAGE "sql"
  STABLE
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  select exists (
    select 1
    from public.request_message_attachments a
    where a.storage_path = p_name
      and a.sender_id = (select auth.uid())
      and a.uploaded_at is null
      and public.request_conversation_is_accessible(
        a.conversation_id,
        (select auth.uid())
      )
      and split_part(p_name, '/', 1) = a.sender_id::text
      and split_part(p_name, '/', 2) = 'chat'
      and split_part(p_name, '/', 3) = a.conversation_id::text
      and split_part(p_name, '/', 4) = a.message_id::text
      and split_part(p_name, '/', 5) like a.id::text || '-%'
  );
$$;

ALTER FUNCTION "public"."can_write_conversation_media"("p_name" "text") OWNER TO "postgres";

DROP POLICY IF EXISTS "read conversation media when allowed" ON "storage"."objects";
DROP POLICY IF EXISTS "users write their own conversation media" ON "storage"."objects";
DROP POLICY IF EXISTS "users delete their own conversation media" ON "storage"."objects";

CREATE POLICY "read conversation media when allowed" ON "storage"."objects"
  FOR SELECT TO "authenticated"
  USING (
    bucket_id = 'conversation-media'
    AND public.can_read_conversation_media(name)
  );

CREATE POLICY "users write reserved conversation media" ON "storage"."objects"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    bucket_id = 'conversation-media'
    AND public.can_write_conversation_media(name)
  );

UPDATE "public"."request_message_attachments"
SET "uploaded_at" = "created_at"
WHERE "uploaded_at" IS NULL;

CREATE OR REPLACE FUNCTION "public"."request_message_attachments_for_row"("p_message_id" "uuid")
RETURNS "jsonb"
  LANGUAGE "sql"
  STABLE
  SET "search_path" TO ''
  AS $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'storage_path', a.storage_path,
        'file_name', a.file_name,
        'mime_type', a.mime_type,
        'file_size', a.file_size,
        'attachment_type', a.attachment_type,
        'created_at', a.created_at
      )
      order by a.created_at, a.id
    ),
    '[]'::jsonb
  )
  from public.request_message_attachments a
  where a.message_id = p_message_id
    and a.uploaded_at is not null;
$$;

CREATE OR REPLACE FUNCTION "public"."begin_request_message_with_attachments"(
  "p_conversation_id" "uuid",
  "p_body" "text" DEFAULT '',
  "p_planned_attachments" "jsonb" DEFAULT '[]'::"jsonb"
) RETURNS TABLE(
  "message_id" "uuid",
  "attachment_id" "uuid",
  "storage_path" "text"
)
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_body text := left(btrim(p_body), 2000);
  v_request_status public.request_status;
  v_message_id uuid;
  v_item jsonb;
  v_attachment_id uuid;
  v_file_name text;
  v_mime_type text;
  v_file_size bigint;
  v_attachment_type public.conversation_attachment_type;
  v_storage_path text;
  v_count integer := 0;
begin
  if jsonb_typeof(p_planned_attachments) is distinct from 'array' then
    raise exception 'planned attachments must be a json array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_planned_attachments) < 1 then
    raise exception 'at least one attachment is required' using errcode = '22023';
  end if;

  if jsonb_array_length(p_planned_attachments) > 10 then
    raise exception 'too many attachments' using errcode = '22023';
  end if;

  if v_body = '' and jsonb_array_length(p_planned_attachments) < 1 then
    raise exception 'message cannot be empty' using errcode = '22023';
  end if;

  if not public.request_conversation_is_accessible(p_conversation_id, v_user_id) then
    raise exception 'conversation not found or not accessible' using errcode = '42501';
  end if;

  select r.status
    into v_request_status
  from public.request_conversations c
  join public.requests r on r.id = c.request_id
  where c.id = p_conversation_id;

  if not public.request_conversation_messaging_enabled(v_request_status) then
    raise exception 'this conversation is read-only' using errcode = '55000';
  end if;

  insert into public.request_messages (
    conversation_id,
    sender_id,
    message_type,
    body
  )
  values (
    p_conversation_id,
    v_user_id,
    'text'::public.conversation_message_type,
    v_body
  )
  returning id into v_message_id;

  for v_item in
    select value
    from jsonb_array_elements(p_planned_attachments)
  loop
    v_file_name := nullif(btrim(v_item ->> 'file_name'), '');
    v_mime_type := nullif(btrim(v_item ->> 'mime_type'), '');
    v_attachment_type := (v_item ->> 'attachment_type')::public.conversation_attachment_type;

    if v_mime_type is null or v_attachment_type is null then
      raise exception 'planned attachment requires mime_type and attachment_type' using errcode = '22023';
    end if;

    if v_item ? 'file_size' and v_item ->> 'file_size' is not null then
      v_file_size := (v_item ->> 'file_size')::bigint;
    else
      v_file_size := null;
    end if;

    v_attachment_id := gen_random_uuid();
    v_storage_path := public.conversation_chat_storage_path(
      v_user_id,
      p_conversation_id,
      v_message_id,
      v_attachment_id,
      coalesce(v_file_name, 'attachment')
    );

    insert into public.request_message_attachments (
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
    values (
      v_attachment_id,
      v_message_id,
      p_conversation_id,
      v_user_id,
      v_storage_path,
      v_file_name,
      v_mime_type,
      v_file_size,
      v_attachment_type,
      null
    );

    message_id := v_message_id;
    attachment_id := v_attachment_id;
    storage_path := v_storage_path;
    return next;

    v_count := v_count + 1;
  end loop;

  if v_count < 1 then
    raise exception 'at least one attachment is required' using errcode = '22023';
  end if;
end;
$$;

ALTER FUNCTION "public"."begin_request_message_with_attachments"(
  "p_conversation_id" "uuid",
  "p_body" "text",
  "p_planned_attachments" "jsonb"
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."complete_request_message_with_attachments"("p_message_id" "uuid")
RETURNS "void"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_conversation_id uuid;
  v_attachment record;
  v_storage_mime text;
begin
  select m.conversation_id
    into v_conversation_id
  from public.request_messages m
  where m.id = p_message_id
    and m.sender_id = v_user_id
    and m.message_type = 'text'::public.conversation_message_type;

  if v_conversation_id is null then
    raise exception 'message not found or not accessible' using errcode = '42501';
  end if;

  if not public.request_conversation_is_accessible(v_conversation_id, v_user_id) then
    raise exception 'conversation not found or not accessible' using errcode = '42501';
  end if;

  for v_attachment in
    select a.id, a.storage_path, a.mime_type
    from public.request_message_attachments a
    where a.message_id = p_message_id
      and a.sender_id = v_user_id
      and a.uploaded_at is null
  loop
    select
      coalesce(
        nullif(btrim(o.metadata ->> 'mimetype'), ''),
        nullif(btrim(o.metadata ->> 'contentType'), '')
      )
      into v_storage_mime
    from storage.objects o
    where o.bucket_id = 'conversation-media'
      and o.name = v_attachment.storage_path;

    if v_storage_mime is null then
      raise exception 'attachment was not uploaded' using errcode = '22023';
    end if;

    update public.request_message_attachments a
    set
      uploaded_at = now(),
      mime_type = v_storage_mime,
      attachment_type = public.conversation_attachment_type_for_mime(v_storage_mime)
    where a.id = v_attachment.id;
  end loop;

  if not exists (
    select 1
    from public.request_message_attachments a
    where a.message_id = p_message_id
      and a.uploaded_at is not null
  ) then
    raise exception 'at least one attachment is required' using errcode = '22023';
  end if;

  perform public.notify_request_message_manual(p_message_id);
end;
$$;

ALTER FUNCTION "public"."complete_request_message_with_attachments"("p_message_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."notify_request_message_manual"("p_message_id" "uuid")
RETURNS "void"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_message public.request_messages%rowtype;
begin
  select * into v_message
  from public.request_messages m
  where m.id = p_message_id;

  if v_message.id is null then
    return;
  end if;

  perform public.notify_request_message_dispatch(v_message);
end;
$$;

ALTER FUNCTION "public"."notify_request_message_manual"("p_message_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."notify_request_message_dispatch"("p_message" "public"."request_messages")
RETURNS "void"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_request_id uuid;
  v_recipient_id uuid;
  v_sender_name text;
  v_sender_first text;
begin
  select c.requester_id, c.selected_user_id, c.request_id
    into v_requester_id, v_selected_user_id, v_request_id
  from public.request_conversations c
  where c.id = p_message.conversation_id;

  if v_request_id is null then
    return;
  end if;

  if p_message.sender_id = v_requester_id then
    v_recipient_id := v_selected_user_id;
  elsif p_message.sender_id = v_selected_user_id then
    v_recipient_id := v_requester_id;
  else
    return;
  end if;

  if v_recipient_id is null or v_recipient_id = p_message.sender_id then
    return;
  end if;

  if public.recipient_is_viewing_conversation(v_recipient_id, p_message.conversation_id) then
    return;
  end if;

  select p.display_name
    into v_sender_name
  from public.profiles p
  where p.id = p_message.sender_id;

  v_sender_first := coalesce(public.display_first_name(v_sender_name), 'Someone');

  perform public.create_notification(
    v_recipient_id,
    'request_message:' || p_message.id::text,
    'new_message'::public.notification_type,
    'New message',
    format('%s sent you a message.', v_sender_first),
    format('/conversation/%s', v_request_id),
    v_request_id,
    null,
    null,
    null,
    p_message.sender_id,
    jsonb_build_object('message_id', p_message.id, 'conversation_id', p_message.conversation_id),
    true
  );
end;
$$;

ALTER FUNCTION "public"."notify_request_message_dispatch"("p_message" "public"."request_messages") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."notify_request_message"() RETURNS "trigger"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
begin
  if exists (
    select 1
    from public.request_message_attachments a
    where a.message_id = new.id
      and a.uploaded_at is null
  ) then
    return new;
  end if;

  perform public.notify_request_message_dispatch(new);
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."send_request_message_with_attachments"(
  "p_conversation_id" "uuid",
  "p_body" "text" DEFAULT '',
  "p_storage_paths" "text"[] DEFAULT '{}'::"text"[]
) RETURNS "uuid"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
begin
  raise exception 'use begin_request_message_with_attachments and complete_request_message_with_attachments' using errcode = '55000';
end;
$$;

CREATE OR REPLACE FUNCTION "public"."send_request_message_attachment"(
  "p_conversation_id" "uuid",
  "p_storage_path" "text",
  "p_caption" "text" DEFAULT NULL
) RETURNS "uuid"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
begin
  raise exception 'use begin_request_message_with_attachments and complete_request_message_with_attachments' using errcode = '55000';
end;
$$;

REVOKE ALL ON FUNCTION "public"."begin_request_message_with_attachments"(
  "p_conversation_id" "uuid",
  "p_body" "text",
  "p_planned_attachments" "jsonb"
) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_request_message_with_attachments"(
  "p_conversation_id" "uuid",
  "p_body" "text",
  "p_planned_attachments" "jsonb"
) TO "authenticated";
GRANT ALL ON FUNCTION "public"."begin_request_message_with_attachments"(
  "p_conversation_id" "uuid",
  "p_body" "text",
  "p_planned_attachments" "jsonb"
) TO "service_role";

REVOKE ALL ON FUNCTION "public"."complete_request_message_with_attachments"("p_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_request_message_with_attachments"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_request_message_with_attachments"("p_message_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."can_write_conversation_media"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_write_conversation_media"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_write_conversation_media"("p_name" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."sanitize_chat_attachment_filename"("p_file_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sanitize_chat_attachment_filename"("p_file_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sanitize_chat_attachment_filename"("p_file_name" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."conversation_chat_storage_path"(
  "p_user_id" "uuid",
  "p_conversation_id" "uuid",
  "p_message_id" "uuid",
  "p_attachment_id" "uuid",
  "p_file_name" "text"
) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."conversation_chat_storage_path"(
  "p_user_id" "uuid",
  "p_conversation_id" "uuid",
  "p_message_id" "uuid",
  "p_attachment_id" "uuid",
  "p_file_name" "text"
) TO "authenticated";
GRANT ALL ON FUNCTION "public"."conversation_chat_storage_path"(
  "p_user_id" "uuid",
  "p_conversation_id" "uuid",
  "p_message_id" "uuid",
  "p_attachment_id" "uuid",
  "p_file_name" "text"
) TO "service_role";
