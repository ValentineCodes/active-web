-- Abort failed attachment sends and idempotent begin/complete for chat messages.

DROP FUNCTION IF EXISTS "public"."begin_request_message_with_attachments"("p_conversation_id" "uuid", "p_body" "text", "p_planned_attachments" "jsonb");

CREATE OR REPLACE FUNCTION "public"."abort_request_message_with_attachments"("p_message_id" "uuid")
RETURNS "void"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_conversation_id uuid;
begin
  select m.conversation_id
    into v_conversation_id
  from public.request_messages m
  where m.id = p_message_id
    and m.sender_id = v_user_id
    and m.message_type = 'text'::public.conversation_message_type;

  if v_conversation_id is null then
    return;
  end if;

  if not public.request_conversation_is_accessible(v_conversation_id, v_user_id) then
    raise exception 'conversation not found or not accessible' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.request_message_attachments a
    where a.message_id = p_message_id
      and a.uploaded_at is not null
  ) then
    raise exception 'We couldn''t upload this file. Try again.' using errcode = '22023';
  end if;

  delete from storage.objects o
  using public.request_message_attachments a
  where a.message_id = p_message_id
    and a.sender_id = v_user_id
    and o.bucket_id = 'conversation-media'
    and o.name = a.storage_path;

  delete from public.request_message_attachments a
  where a.message_id = p_message_id
    and a.sender_id = v_user_id;

  delete from public.request_messages m
  where m.id = p_message_id
    and m.sender_id = v_user_id;
end;
$$;

ALTER FUNCTION "public"."abort_request_message_with_attachments"("p_message_id" "uuid") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."abort_request_message_with_attachments"("p_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."abort_request_message_with_attachments"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."abort_request_message_with_attachments"("p_message_id" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."begin_request_message_with_attachments"(
  "p_conversation_id" "uuid",
  "p_body" "text" DEFAULT '',
  "p_planned_attachments" "jsonb" DEFAULT '[]'::"jsonb",
  "p_client_send_id" "uuid" DEFAULT NULL::"uuid"
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
  v_attachment record;
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

  if p_client_send_id is not null then
    select m.id
      into v_message_id
    from public.request_messages m
    where m.conversation_id = p_conversation_id
      and m.sender_id = v_user_id
      and m.message_type = 'text'::public.conversation_message_type
      and m.metadata @> jsonb_build_object('client_send_id', p_client_send_id::text)
      and not exists (
        select 1
        from public.request_message_attachments a
        where a.message_id = m.id
          and a.uploaded_at is not null
      );

    if v_message_id is not null then
      for v_attachment in
        select a.id, a.storage_path
        from public.request_message_attachments a
        where a.message_id = v_message_id
        order by a.created_at, a.id
      loop
        message_id := v_message_id;
        attachment_id := v_attachment.id;
        storage_path := v_attachment.storage_path;
        return next;
      end loop;
      return;
    end if;
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
    body,
    metadata
  )
  values (
    p_conversation_id,
    v_user_id,
    'text'::public.conversation_message_type,
    v_body,
    case
      when p_client_send_id is null then null
      else jsonb_build_object('client_send_id', p_client_send_id::text)
    end
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

  if not exists (
    select 1
    from public.request_message_attachments a
    where a.message_id = p_message_id
      and a.uploaded_at is null
  ) then
    return;
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

REVOKE ALL ON FUNCTION "public"."begin_request_message_with_attachments"(
  "p_conversation_id" "uuid",
  "p_body" "text",
  "p_planned_attachments" "jsonb",
  "p_client_send_id" "uuid"
) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_request_message_with_attachments"(
  "p_conversation_id" "uuid",
  "p_body" "text",
  "p_planned_attachments" "jsonb",
  "p_client_send_id" "uuid"
) TO "authenticated";
GRANT ALL ON FUNCTION "public"."begin_request_message_with_attachments"(
  "p_conversation_id" "uuid",
  "p_body" "text",
  "p_planned_attachments" "jsonb",
  "p_client_send_id" "uuid"
) TO "service_role";
