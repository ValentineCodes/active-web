-- Chat attachments: private conversation-media bucket + attachment message type.

ALTER TYPE "public"."conversation_message_type" ADD VALUE IF NOT EXISTS 'attachment';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'conversation-media',
  'conversation-media',
  false,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION "public"."conversation_media_path_is_valid"(
  "p_user_id" "uuid",
  "p_conversation_id" "uuid",
  "p_storage_path" "text"
) RETURNS boolean
  LANGUAGE "sql"
  IMMUTABLE
  SET "search_path" TO ''
  AS $$
  select
    split_part(p_storage_path, '/', 1) = p_user_id::text
    and split_part(p_storage_path, '/', 2) = 'conversations'
    and split_part(p_storage_path, '/', 3) = p_conversation_id::text
    and split_part(p_storage_path, '/', 4) <> '';
$$;

ALTER FUNCTION "public"."conversation_media_path_is_valid"("p_user_id" "uuid", "p_conversation_id" "uuid", "p_storage_path" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."can_read_conversation_media"("p_name" "text") RETURNS boolean
  LANGUAGE "sql"
  STABLE
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  select
    (
      (storage.foldername(p_name))[1] = (select auth.uid())::text
      and (storage.foldername(p_name))[2] = 'conversations'
    )
    or (
      (storage.foldername(p_name))[2] = 'conversations'
      and public.request_conversation_is_accessible(
        ((storage.foldername(p_name))[3])::uuid,
        (select auth.uid())
      )
    );
$$;

ALTER FUNCTION "public"."can_read_conversation_media"("p_name" "text") OWNER TO "postgres";

DROP POLICY IF EXISTS "read conversation media when allowed" ON "storage"."objects";
DROP POLICY IF EXISTS "users write their own conversation media" ON "storage"."objects";
DROP POLICY IF EXISTS "users delete their own conversation media" ON "storage"."objects";

CREATE POLICY "read conversation media when allowed" ON "storage"."objects"
  FOR SELECT TO "authenticated"
  USING (
    bucket_id = 'conversation-media'
    AND public.can_read_conversation_media(name)
  );

CREATE POLICY "users write their own conversation media" ON "storage"."objects"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    bucket_id = 'conversation-media'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
    AND (storage.foldername(name))[2] = 'conversations'
  );

CREATE POLICY "users delete their own conversation media" ON "storage"."objects"
  FOR DELETE TO "authenticated"
  USING (
    bucket_id = 'conversation-media'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE OR REPLACE FUNCTION "public"."guard_request_message_columns"() RETURNS "trigger"
  LANGUAGE "plpgsql"
  SET "search_path" TO ''
  AS $$
declare
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_actor uuid := (select auth.uid());
  v_request_status public.request_status;
begin
  select c.requester_id, c.selected_user_id
    into v_requester_id, v_selected_user_id
  from public.request_conversations c
  where c.id = new.conversation_id;

  if v_requester_id is null then
    raise exception 'conversation not found or not accessible' using errcode = '42501';
  end if;

  if new.sender_id not in (v_requester_id, v_selected_user_id) then
    raise exception 'sender must be a conversation participant' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.message_type in (
      'text'::public.conversation_message_type,
      'attachment'::public.conversation_message_type
    ) then
      if v_actor is not null and v_actor is distinct from new.sender_id then
        raise exception 'sender_id must match authenticated user' using errcode = '42501';
      end if;

      if v_actor is not null then
        if not public.request_conversation_is_accessible(new.conversation_id, v_actor) then
          raise exception 'conversation not found or not accessible' using errcode = '42501';
        end if;

        select r.status
          into v_request_status
        from public.request_conversations c
        join public.requests r on r.id = c.request_id
        where c.id = new.conversation_id;

        if not public.request_conversation_messaging_enabled(v_request_status) then
          raise exception 'this conversation is read-only' using errcode = '55000';
        end if;
      end if;

      if new.message_type = 'attachment'::public.conversation_message_type then
        if new.metadata is null
           or btrim(new.metadata ->> 'storage_path') = ''
           or btrim(new.metadata ->> 'content_type') = ''
           or btrim(new.metadata ->> 'kind') = '' then
          raise exception 'attachment message requires metadata.storage_path, content_type, and kind' using errcode = '22023';
        end if;

        if new.metadata ->> 'kind' not in ('image', 'video', 'file') then
          raise exception 'attachment metadata.kind must be image, video, or file' using errcode = '22023';
        end if;
      end if;

      return new;
    end if;

    if new.message_type = 'system'::public.conversation_message_type
       and coalesce(current_setting('request.conversation_system_message', true), '') = '1' then
      if new.metadata is null or btrim(new.metadata ->> 'lifecycle_key') = '' then
        raise exception 'system lifecycle message requires metadata.lifecycle_key' using errcode = '22023';
      end if;
      if btrim(new.metadata ->> 'event') = '' then
        raise exception 'system message requires metadata.event' using errcode = '22023';
      end if;
      return new;
    end if;

    if new.message_type = 'system'::public.conversation_message_type
       and public.request_message_system_insert_allowed() then
      if new.metadata is null or btrim(new.metadata ->> 'event') = '' then
        raise exception 'system message requires metadata.event' using errcode = '22023';
      end if;
      return new;
    end if;

    raise exception 'only text and attachment messages are supported' using errcode = '22023';
  end if;

  if new.id is distinct from old.id
     or new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.message_type is distinct from old.message_type
     or new.body is distinct from old.body
     or new.metadata is distinct from old.metadata
     or new.created_at is distinct from old.created_at
     or new.updated_at is distinct from old.updated_at
  then
    raise exception 'only read_at may be updated' using errcode = '55000';
  end if;

  if old.sender_id = v_actor then
    raise exception 'sender cannot mark their own message read' using errcode = '42501';
  end if;

  if v_actor is not null
     and not public.request_conversation_is_accessible(old.conversation_id, v_actor) then
    raise exception 'not a conversation participant' using errcode = '42501';
  end if;

  if v_actor is distinct from v_requester_id and v_actor is distinct from v_selected_user_id then
    raise exception 'not a conversation participant' using errcode = '42501';
  end if;

  return new;
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
declare
  v_user_id uuid := public.assert_authenticated();
  v_storage_path text := btrim(p_storage_path);
  v_caption text := nullif(btrim(p_caption), '');
  v_message_id uuid;
  v_request_status public.request_status;
  v_content_type text;
  v_file_name text;
  v_kind text;
begin
  if v_storage_path = '' then
    raise exception 'storage path is required' using errcode = '22023';
  end if;

  if not public.request_conversation_is_accessible(p_conversation_id, v_user_id) then
    raise exception 'conversation not found or not accessible' using errcode = '42501';
  end if;

  if not public.conversation_media_path_is_valid(v_user_id, p_conversation_id, v_storage_path) then
    raise exception 'invalid attachment path' using errcode = '22023';
  end if;

  select r.status
    into v_request_status
  from public.request_conversations c
  join public.requests r on r.id = c.request_id
  where c.id = p_conversation_id;

  if not public.request_conversation_messaging_enabled(v_request_status) then
    raise exception 'this conversation is read-only' using errcode = '55000';
  end if;

  select
    coalesce(nullif(btrim(o.metadata ->> 'mimetype'), ''), nullif(btrim(o.metadata ->> 'contentType'), '')),
    nullif(btrim(o.metadata ->> 'name'), '')
    into v_content_type, v_file_name
  from storage.objects o
  where o.bucket_id = 'conversation-media'
    and o.name = v_storage_path;

  if v_content_type is null then
    raise exception 'attachment was not uploaded' using errcode = '22023';
  end if;

  if v_content_type like 'image/%' then
    v_kind := 'image';
  elsif v_content_type like 'video/%' then
    v_kind := 'video';
  else
    v_kind := 'file';
  end if;

  insert into public.request_messages (
    conversation_id,
    sender_id,
    message_type,
    body,
    metadata
  )
  values (
    p_conversation_id,
    v_user_id,
    'attachment'::public.conversation_message_type,
    left(
      coalesce(v_caption, v_file_name, 'Attachment'),
      2000
    ),
    jsonb_build_object(
      'storage_path', v_storage_path,
      'content_type', v_content_type,
      'file_name', v_file_name,
      'kind', v_kind
    )
  )
  returning id into v_message_id;

  return v_message_id;
end;
$$;

ALTER FUNCTION "public"."send_request_message_attachment"("p_conversation_id" "uuid", "p_storage_path" "text", "p_caption" "text") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."send_request_message_attachment"("p_conversation_id" "uuid", "p_storage_path" "text", "p_caption" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_request_message_attachment"("p_conversation_id" "uuid", "p_storage_path" "text", "p_caption" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_request_message_attachment"("p_conversation_id" "uuid", "p_storage_path" "text", "p_caption" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."can_read_conversation_media"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_read_conversation_media"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_conversation_media"("p_name" "text") TO "service_role";
