-- Authoritative chat attachment allowlists and size limits (keep in sync with src/config.ts CONVERSATION_ATTACHMENTS).

CREATE OR REPLACE FUNCTION "public"."conversation_attachment_max_bytes"(
  "p_kind" "public"."conversation_attachment_type"
) RETURNS bigint
  LANGUAGE "sql"
  IMMUTABLE
  SET "search_path" TO ''
  AS $$
  select case p_kind
    when 'image'::public.conversation_attachment_type then 5242880::bigint
    when 'video'::public.conversation_attachment_type then 52428800::bigint
    else 26214400::bigint
  end;
$$;

CREATE OR REPLACE FUNCTION "public"."conversation_attachment_normalize_mime"("p_mime" "text")
RETURNS "text"
  LANGUAGE "sql"
  IMMUTABLE
  SET "search_path" TO ''
  AS $$
  select lower(split_part(btrim(coalesce(p_mime, '')), ';', 1));
$$;

CREATE OR REPLACE FUNCTION "public"."conversation_attachment_filename_extension"("p_file_name" "text")
RETURNS "text"
  LANGUAGE "sql"
  IMMUTABLE
  SET "search_path" TO ''
  AS $$
  select nullif(
    lower(
      regexp_replace(
        coalesce(split_part(btrim(coalesce(p_file_name, '')), '.', -1), ''),
        '[^a-z0-9]+',
        '',
        'g'
      )
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION "public"."conversation_attachment_extension_is_blocked"("p_ext" "text")
RETURNS boolean
  LANGUAGE "sql"
  IMMUTABLE
  SET "search_path" TO ''
  AS $$
  select coalesce(p_ext, '') in (
    'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'sh', 'bash', 'apk', 'ipa', 'dll', 'vbs',
    'js', 'mjs', 'cjs', 'jar', 'dmg', 'pkg', 'deb', 'rpm', 'app', 'hta', 'wsf', 'cpl', 'msc',
    'reg', 'iso'
  );
$$;

CREATE OR REPLACE FUNCTION "public"."conversation_attachment_mime_kind"("p_mime" "text")
RETURNS "public"."conversation_attachment_type"
  LANGUAGE "sql"
  IMMUTABLE
  SET "search_path" TO ''
  AS $$
  select case public.conversation_attachment_normalize_mime(p_mime)
    when 'image/jpeg' then 'image'::public.conversation_attachment_type
    when 'image/png' then 'image'::public.conversation_attachment_type
    when 'image/webp' then 'image'::public.conversation_attachment_type
    when 'image/heic' then 'image'::public.conversation_attachment_type
    when 'image/heif' then 'image'::public.conversation_attachment_type
    when 'video/mp4' then 'video'::public.conversation_attachment_type
    when 'video/quicktime' then 'video'::public.conversation_attachment_type
    when 'video/3gpp' then 'video'::public.conversation_attachment_type
    when 'video/3gpp2' then 'video'::public.conversation_attachment_type
    when 'application/pdf' then 'file'::public.conversation_attachment_type
    when 'text/plain' then 'file'::public.conversation_attachment_type
    when 'text/csv' then 'file'::public.conversation_attachment_type
    when 'application/msword' then 'file'::public.conversation_attachment_type
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'file'::public.conversation_attachment_type
    when 'application/vnd.ms-excel' then 'file'::public.conversation_attachment_type
    when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then 'file'::public.conversation_attachment_type
    when 'application/rtf' then 'file'::public.conversation_attachment_type
    when 'application/vnd.oasis.opendocument.text' then 'file'::public.conversation_attachment_type
    when 'application/vnd.oasis.opendocument.spreadsheet' then 'file'::public.conversation_attachment_type
    else null
  end;
$$;

CREATE OR REPLACE FUNCTION "public"."conversation_attachment_validate_planned"(
  "p_file_name" "text",
  "p_mime_type" "text",
  "p_file_size" bigint,
  "p_attachment_type" "public"."conversation_attachment_type"
) RETURNS "void"
  LANGUAGE "plpgsql"
  SET "search_path" TO ''
  AS $$
declare
  v_mime text;
  v_kind public.conversation_attachment_type;
  v_ext text;
  v_max bigint;
begin
  v_mime := public.conversation_attachment_normalize_mime(p_mime_type);
  v_kind := public.conversation_attachment_mime_kind(v_mime);

  if v_kind is null then
    raise exception 'This file type isn''t supported.' using errcode = '22023';
  end if;

  if v_kind is distinct from p_attachment_type then
    raise exception 'This file type isn''t supported.' using errcode = '22023';
  end if;

  v_ext := public.conversation_attachment_filename_extension(p_file_name);
  if public.conversation_attachment_extension_is_blocked(v_ext) then
    raise exception 'This file type isn''t supported.' using errcode = '22023';
  end if;

  if p_file_size is null or p_file_size < 1 then
    raise exception 'We couldn''t upload this file. Try again.' using errcode = '22023';
  end if;

  v_max := public.conversation_attachment_max_bytes(p_attachment_type);
  if p_file_size > v_max then
    raise exception 'This file is too large.' using errcode = '22023';
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."conversation_attachment_validate_stored"(
  "p_mime_type" "text",
  "p_file_size" bigint,
  "p_expected_type" "public"."conversation_attachment_type"
) RETURNS "public"."conversation_attachment_type"
  LANGUAGE "plpgsql"
  SET "search_path" TO ''
  AS $$
declare
  v_kind public.conversation_attachment_type;
  v_max bigint;
begin
  v_kind := public.conversation_attachment_mime_kind(p_mime_type);

  if v_kind is null then
    raise exception 'This file type isn''t supported.' using errcode = '22023';
  end if;

  if v_kind is distinct from p_expected_type then
    raise exception 'This file type isn''t supported.' using errcode = '22023';
  end if;

  if p_file_size is null or p_file_size < 1 then
    raise exception 'We couldn''t upload this file. Try again.' using errcode = '22023';
  end if;

  v_max := public.conversation_attachment_max_bytes(v_kind);
  if p_file_size > v_max then
    raise exception 'This file is too large.' using errcode = '22023';
  end if;

  return v_kind;
end;
$$;

UPDATE "storage"."buckets"
SET
  "file_size_limit" = 52428800,
  "allowed_mime_types" = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/3gpp',
    'video/3gpp2',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet'
  ]
WHERE "id" = 'conversation-media';

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
    raise exception 'We couldn''t upload this file. Try again.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_planned_attachments) < 1 then
    raise exception 'We couldn''t upload this file. Try again.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_planned_attachments) > 10 then
    raise exception 'We couldn''t upload this file. Try again.' using errcode = '22023';
  end if;

  if v_body = '' and jsonb_array_length(p_planned_attachments) < 1 then
    raise exception 'We couldn''t upload this file. Try again.' using errcode = '22023';
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
      raise exception 'We couldn''t upload this file. Try again.' using errcode = '22023';
    end if;

    if v_item ? 'file_size' and v_item ->> 'file_size' is not null then
      v_file_size := (v_item ->> 'file_size')::bigint;
    else
      v_file_size := null;
    end if;

    perform public.conversation_attachment_validate_planned(
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
      public.conversation_attachment_normalize_mime(v_mime_type),
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
    raise exception 'We couldn''t upload this file. Try again.' using errcode = '22023';
  end if;
end;
$$;

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
  v_storage_size bigint;
  v_kind public.conversation_attachment_type;
begin
  select m.conversation_id
    into v_conversation_id
  from public.request_messages m
  where m.id = p_message_id
    and m.sender_id = v_user_id
    and m.message_type = 'text'::public.conversation_message_type;

  if v_conversation_id is null then
    raise exception 'We couldn''t upload this file. Try again.' using errcode = '42501';
  end if;

  if not public.request_conversation_is_accessible(v_conversation_id, v_user_id) then
    raise exception 'conversation not found or not accessible' using errcode = '42501';
  end if;

  for v_attachment in
    select a.id, a.storage_path, a.mime_type, a.attachment_type, a.file_size
    from public.request_message_attachments a
    where a.message_id = p_message_id
      and a.sender_id = v_user_id
      and a.uploaded_at is null
  loop
    select
      coalesce(
        nullif(btrim(o.metadata ->> 'mimetype'), ''),
        nullif(btrim(o.metadata ->> 'contentType'), '')
      ),
      coalesce(
        nullif(btrim(o.metadata ->> 'size'), '')::bigint,
        nullif(btrim(o.metadata ->> 'contentLength'), '')::bigint
      )
      into v_storage_mime, v_storage_size
    from storage.objects o
    where o.bucket_id = 'conversation-media'
      and o.name = v_attachment.storage_path;

    if v_storage_mime is null then
      raise exception 'We couldn''t upload this file. Try again.' using errcode = '22023';
    end if;

    v_storage_size := coalesce(v_storage_size, v_attachment.file_size);

    v_kind := public.conversation_attachment_validate_stored(
      v_storage_mime,
      v_storage_size,
      v_attachment.attachment_type
    );

    update public.request_message_attachments a
    set
      uploaded_at = now(),
      mime_type = public.conversation_attachment_normalize_mime(v_storage_mime),
      attachment_type = v_kind,
      file_size = v_storage_size
    where a.id = v_attachment.id;
  end loop;

  if not exists (
    select 1
    from public.request_message_attachments a
    where a.message_id = p_message_id
      and a.uploaded_at is not null
  ) then
    raise exception 'We couldn''t upload this file. Try again.' using errcode = '22023';
  end if;

  perform public.notify_request_message_manual(p_message_id);
end;
$$;

ALTER FUNCTION "public"."conversation_attachment_max_bytes"("p_kind" "public"."conversation_attachment_type") OWNER TO "postgres";
ALTER FUNCTION "public"."conversation_attachment_normalize_mime"("p_mime" "text") OWNER TO "postgres";
ALTER FUNCTION "public"."conversation_attachment_filename_extension"("p_file_name" "text") OWNER TO "postgres";
ALTER FUNCTION "public"."conversation_attachment_extension_is_blocked"("p_ext" "text") OWNER TO "postgres";
ALTER FUNCTION "public"."conversation_attachment_mime_kind"("p_mime" "text") OWNER TO "postgres";
ALTER FUNCTION "public"."conversation_attachment_validate_planned"("p_file_name" "text", "p_mime_type" "text", "p_file_size" bigint, "p_attachment_type" "public"."conversation_attachment_type") OWNER TO "postgres";
ALTER FUNCTION "public"."conversation_attachment_validate_stored"("p_mime_type" "text", "p_file_size" bigint, "p_expected_type" "public"."conversation_attachment_type") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."conversation_attachment_max_bytes"("p_kind" "public"."conversation_attachment_type") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."conversation_attachment_max_bytes"("p_kind" "public"."conversation_attachment_type") TO "authenticated";
GRANT ALL ON FUNCTION "public"."conversation_attachment_max_bytes"("p_kind" "public"."conversation_attachment_type") TO "service_role";

REVOKE ALL ON FUNCTION "public"."conversation_attachment_normalize_mime"("p_mime" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."conversation_attachment_normalize_mime"("p_mime" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."conversation_attachment_normalize_mime"("p_mime" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."conversation_attachment_mime_kind"("p_mime" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."conversation_attachment_mime_kind"("p_mime" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."conversation_attachment_mime_kind"("p_mime" "text") TO "service_role";
