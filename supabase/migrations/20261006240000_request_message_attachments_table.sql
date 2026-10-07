-- Normalized chat attachments: rows per file, text messages carry optional body + N attachments.

CREATE TYPE "public"."conversation_attachment_type" AS ENUM (
  'image',
  'video',
  'file'
);

ALTER TYPE "public"."conversation_attachment_type" OWNER TO "postgres";

CREATE TABLE "public"."request_message_attachments" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "message_id" "uuid" NOT NULL,
  "conversation_id" "uuid" NOT NULL,
  "sender_id" "uuid" NOT NULL,
  "storage_path" "text" NOT NULL,
  "file_name" "text",
  "mime_type" "text" NOT NULL,
  "file_size" bigint,
  "attachment_type" "public"."conversation_attachment_type" NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "request_message_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "request_message_attachments_storage_path_key" UNIQUE ("storage_path"),
  CONSTRAINT "request_message_attachments_file_size_check" CHECK (
    "file_size" IS NULL OR "file_size" >= 0
  ),
  CONSTRAINT "request_message_attachments_mime_type_check" CHECK (
    "char_length"("btrim"("mime_type")) >= 1
  )
);

ALTER TABLE "public"."request_message_attachments" OWNER TO "postgres";

COMMENT ON TABLE "public"."request_message_attachments" IS
  'Private conversation-media objects attached to a chat message. Access via storage_path + signed URLs; no public URLs stored here.';

ALTER TABLE ONLY "public"."request_message_attachments"
  ADD CONSTRAINT "request_message_attachments_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "public"."request_messages"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."request_message_attachments"
  ADD CONSTRAINT "request_message_attachments_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "public"."request_conversations"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."request_message_attachments"
  ADD CONSTRAINT "request_message_attachments_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;

CREATE INDEX "request_message_attachments_message_id_idx"
  ON "public"."request_message_attachments" USING "btree" ("message_id");

CREATE INDEX "request_message_attachments_conversation_id_idx"
  ON "public"."request_message_attachments" USING "btree" ("conversation_id");

CREATE INDEX "request_message_attachments_conversation_created_idx"
  ON "public"."request_message_attachments" USING "btree" ("conversation_id", "created_at" DESC);

ALTER TABLE "public"."request_messages"
  DROP CONSTRAINT IF EXISTS "request_messages_body_check";

ALTER TABLE "public"."request_messages"
  ADD CONSTRAINT "request_messages_body_check" CHECK (
    "char_length"("body") <= 2000
  );

-- Legacy attachment rows (metadata on message) -> attachment table + text message body.
INSERT INTO "public"."request_message_attachments" (
  "message_id",
  "conversation_id",
  "sender_id",
  "storage_path",
  "file_name",
  "mime_type",
  "attachment_type",
  "created_at"
)
SELECT
  m.id,
  m.conversation_id,
  m.sender_id,
  m.metadata ->> 'storage_path',
  nullif(btrim(m.metadata ->> 'file_name'), ''),
  m.metadata ->> 'content_type',
  (m.metadata ->> 'kind')::public.conversation_attachment_type,
  m.created_at
FROM "public"."request_messages" m
WHERE m.message_type = 'attachment'::public.conversation_message_type
  AND m.metadata ? 'storage_path'
  AND btrim(m.metadata ->> 'storage_path') <> '';

UPDATE "public"."request_messages" m
SET
  message_type = 'text'::public.conversation_message_type,
  metadata = NULL
WHERE m.message_type = 'attachment'::public.conversation_message_type;

CREATE OR REPLACE FUNCTION "public"."conversation_attachment_type_for_mime"("p_mime_type" "text")
RETURNS "public"."conversation_attachment_type"
  LANGUAGE "sql"
  IMMUTABLE
  SET "search_path" TO ''
  AS $$
  select case
    when p_mime_type like 'image/%' then 'image'::public.conversation_attachment_type
    when p_mime_type like 'video/%' then 'video'::public.conversation_attachment_type
    else 'file'::public.conversation_attachment_type
  end;
$$;

ALTER FUNCTION "public"."conversation_attachment_type_for_mime"("p_mime_type" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."guard_request_message_attachment_columns"() RETURNS "trigger"
  LANGUAGE "plpgsql"
  SET "search_path" TO ''
  AS $$
declare
  v_message public.request_messages%rowtype;
begin
  select * into v_message
  from public.request_messages m
  where m.id = new.message_id;

  if v_message.id is null then
    raise exception 'message not found' using errcode = '23503';
  end if;

  if new.conversation_id is distinct from v_message.conversation_id then
    raise exception 'attachment conversation_id must match message' using errcode = '22023';
  end if;

  if new.sender_id is distinct from v_message.sender_id then
    raise exception 'attachment sender_id must match message' using errcode = '22023';
  end if;

  if v_message.message_type is distinct from 'text'::public.conversation_message_type then
    raise exception 'attachments are only allowed on text messages' using errcode = '22023';
  end if;

  return new;
end;
$$;

CREATE TRIGGER "request_message_attachments_guard_columns"
  BEFORE INSERT OR UPDATE ON "public"."request_message_attachments"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."guard_request_message_attachment_columns"();

ALTER TABLE "public"."request_message_attachments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "request_message_attachments_select_participant"
  ON "public"."request_message_attachments"
  FOR SELECT TO "authenticated"
  USING (
    public.request_conversation_is_accessible(
      "conversation_id",
      (SELECT "auth"."uid"() AS "uid")
    )
  );

REVOKE INSERT, UPDATE, DELETE ON TABLE "public"."request_message_attachments" FROM "authenticated";

GRANT SELECT ON TABLE "public"."request_message_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."request_message_attachments" TO "service_role";

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
    if new.message_type = 'text'::public.conversation_message_type then
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

    raise exception 'only text messages are supported' using errcode = '22023';
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
  where a.message_id = p_message_id;
$$;

ALTER FUNCTION "public"."request_message_attachments_for_row"("p_message_id" "uuid") OWNER TO "postgres";

DROP FUNCTION IF EXISTS "public"."list_request_messages"(
  "p_conversation_id" "uuid",
  "p_limit" integer,
  "p_before" timestamp with time zone
);

CREATE OR REPLACE FUNCTION "public"."list_request_messages"(
  "p_conversation_id" "uuid",
  "p_limit" integer DEFAULT 40,
  "p_before" timestamp with time zone DEFAULT NULL
) RETURNS TABLE(
  "message_id" "uuid",
  "sender_id" "uuid",
  "message_type" "public"."conversation_message_type",
  "body" "text",
  "metadata" "jsonb",
  "attachments" "jsonb",
  "created_at" timestamp with time zone,
  "read_at" timestamp with time zone
)
  LANGUAGE "sql"
  STABLE
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  with me as (select public.assert_authenticated() as user_id)
  select
    m.id,
    m.sender_id,
    m.message_type,
    m.body,
    m.metadata,
    public.request_message_attachments_for_row(m.id),
    m.created_at,
    m.read_at
  from me
  join public.request_conversations c
    on c.id = p_conversation_id
   and public.request_conversation_is_accessible(c.id, me.user_id)
  join public.request_messages m
    on m.conversation_id = c.id
   and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;

ALTER FUNCTION "public"."list_request_messages"(
  "p_conversation_id" "uuid",
  "p_limit" integer,
  "p_before" timestamp with time zone
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."send_request_message_with_attachments"(
  "p_conversation_id" "uuid",
  "p_body" "text" DEFAULT '',
  "p_storage_paths" "text"[] DEFAULT '{}'::"text"[]
) RETURNS "uuid"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_body text := left(btrim(p_body), 2000);
  v_message_id uuid;
  v_request_status public.request_status;
  v_path text;
  v_content_type text;
  v_file_name text;
  v_file_size bigint;
  v_attachment_type public.conversation_attachment_type;
  v_path_count integer := 0;
begin
  if coalesce(array_length(p_storage_paths, 1), 0) < 1 then
    raise exception 'at least one attachment is required' using errcode = '22023';
  end if;

  if array_length(p_storage_paths, 1) > 10 then
    raise exception 'too many attachments' using errcode = '22023';
  end if;

  if v_body = '' and coalesce(array_length(p_storage_paths, 1), 0) < 1 then
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

  foreach v_path in array p_storage_paths loop
    v_path := btrim(v_path);
    if v_path = '' then
      raise exception 'storage path is required' using errcode = '22023';
    end if;

    if not public.conversation_media_path_is_valid(v_user_id, p_conversation_id, v_path) then
      raise exception 'invalid attachment path' using errcode = '22023';
    end if;

    select
      coalesce(
        nullif(btrim(o.metadata ->> 'mimetype'), ''),
        nullif(btrim(o.metadata ->> 'contentType'), '')
      ),
      nullif(btrim(o.metadata ->> 'name'), ''),
      nullif(btrim(o.metadata ->> 'size'), '')::bigint
      into v_content_type, v_file_name, v_file_size
    from storage.objects o
    where o.bucket_id = 'conversation-media'
      and o.name = v_path;

    if v_content_type is null then
      raise exception 'attachment was not uploaded' using errcode = '22023';
    end if;

    v_attachment_type := public.conversation_attachment_type_for_mime(v_content_type);

    insert into public.request_message_attachments (
      message_id,
      conversation_id,
      sender_id,
      storage_path,
      file_name,
      mime_type,
      file_size,
      attachment_type
    )
    values (
      v_message_id,
      p_conversation_id,
      v_user_id,
      v_path,
      v_file_name,
      v_content_type,
      v_file_size,
      v_attachment_type
    );

    v_path_count := v_path_count + 1;
  end loop;

  if v_path_count < 1 then
    raise exception 'at least one attachment is required' using errcode = '22023';
  end if;

  return v_message_id;
end;
$$;

ALTER FUNCTION "public"."send_request_message_with_attachments"(
  "p_conversation_id" "uuid",
  "p_body" "text",
  "p_storage_paths" "text"[]
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."send_request_message_attachment"(
  "p_conversation_id" "uuid",
  "p_storage_path" "text",
  "p_caption" "text" DEFAULT NULL
) RETURNS "uuid"
  LANGUAGE "sql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  select public.send_request_message_with_attachments(
    p_conversation_id,
    coalesce(nullif(btrim(p_caption), ''), ''),
    array[btrim(p_storage_path)]
  );
$$;

REVOKE ALL ON FUNCTION "public"."list_request_messages"(
  "p_conversation_id" "uuid",
  "p_limit" integer,
  "p_before" timestamp with time zone
) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_request_messages"(
  "p_conversation_id" "uuid",
  "p_limit" integer,
  "p_before" timestamp with time zone
) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_request_messages"(
  "p_conversation_id" "uuid",
  "p_limit" integer,
  "p_before" timestamp with time zone
) TO "service_role";

REVOKE ALL ON FUNCTION "public"."send_request_message_with_attachments"(
  "p_conversation_id" "uuid",
  "p_body" "text",
  "p_storage_paths" "text"[]
) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_request_message_with_attachments"(
  "p_conversation_id" "uuid",
  "p_body" "text",
  "p_storage_paths" "text"[]
) TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_request_message_with_attachments"(
  "p_conversation_id" "uuid",
  "p_body" "text",
  "p_storage_paths" "text"[]
) TO "service_role";

REVOKE ALL ON FUNCTION "public"."request_message_attachments_for_row"("p_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_message_attachments_for_row"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_message_attachments_for_row"("p_message_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."conversation_attachment_type_for_mime"("p_mime_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."conversation_attachment_type_for_mime"("p_mime_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."conversation_attachment_type_for_mime"("p_mime_type" "text") TO "service_role";
