-- Request-scoped 1:1 conversations between requester and selected responder.

CREATE TYPE "public"."conversation_message_type" AS ENUM (
  'text'
);

ALTER TYPE "public"."conversation_message_type" OWNER TO "postgres";

CREATE TABLE "public"."request_conversations" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "request_id" "uuid" NOT NULL,
  "requester_id" "uuid" NOT NULL,
  "selected_user_id" "uuid" NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "request_conversations_participants_distinct" CHECK (
    ("requester_id" IS DISTINCT FROM "selected_user_id")
  )
);

ALTER TABLE "public"."request_conversations" OWNER TO "postgres";

COMMENT ON TABLE "public"."request_conversations" IS
  'One thread per request after selection; participants are the requester and selected_user_id only.';

CREATE TABLE "public"."request_messages" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "conversation_id" "uuid" NOT NULL,
  "sender_id" "uuid" NOT NULL,
  "message_type" "public"."conversation_message_type" DEFAULT 'text'::"public"."conversation_message_type" NOT NULL,
  "body" "text" NOT NULL,
  "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  "read_at" timestamp with time zone,
  CONSTRAINT "request_messages_body_check" CHECK (
    ("char_length"("btrim"("body")) >= 1) AND ("char_length"("body") <= 2000)
  )
);

ALTER TABLE "public"."request_messages" OWNER TO "postgres";

COMMENT ON TABLE "public"."request_messages" IS
  'Messages in a request conversation; sender must be requester or selected responder.';

ALTER TABLE ONLY "public"."request_conversations"
  ADD CONSTRAINT "request_conversations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."request_conversations"
  ADD CONSTRAINT "request_conversations_request_id_key" UNIQUE ("request_id");

ALTER TABLE ONLY "public"."request_conversations"
  ADD CONSTRAINT "request_conversations_request_selected_key" UNIQUE ("request_id", "selected_user_id");

ALTER TABLE ONLY "public"."request_messages"
  ADD CONSTRAINT "request_messages_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."request_conversations"
  ADD CONSTRAINT "request_conversations_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."request_conversations"
  ADD CONSTRAINT "request_conversations_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."request_conversations"
  ADD CONSTRAINT "request_conversations_selected_user_id_fkey" FOREIGN KEY ("selected_user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."request_messages"
  ADD CONSTRAINT "request_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."request_conversations"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."request_messages"
  ADD CONSTRAINT "request_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;

CREATE INDEX "request_conversations_requester_updated_idx" ON "public"."request_conversations" USING "btree" ("requester_id", "updated_at" DESC);

CREATE INDEX "request_conversations_selected_user_updated_idx" ON "public"."request_conversations" USING "btree" ("selected_user_id", "updated_at" DESC);

CREATE INDEX "request_messages_conversation_id_idx" ON "public"."request_messages" USING "btree" ("conversation_id");

CREATE INDEX "request_messages_conversation_created_idx" ON "public"."request_messages" USING "btree" ("conversation_id", "created_at" DESC);

CREATE INDEX "request_messages_created_at_idx" ON "public"."request_messages" USING "btree" ("created_at" DESC);

CREATE OR REPLACE FUNCTION "public"."conversation_participant"(
  "p_requester_id" "uuid",
  "p_selected_user_id" "uuid"
) RETURNS boolean
  LANGUAGE "sql"
  STABLE
  SET "search_path" TO ''
  AS $$
  select (select auth.uid()) in (p_requester_id, p_selected_user_id);
$$;

ALTER FUNCTION "public"."conversation_participant"("p_requester_id" "uuid", "p_selected_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."guard_request_conversation_immutable"() RETURNS "trigger"
  LANGUAGE "plpgsql"
  SET "search_path" TO ''
  AS $$
begin
  if tg_op = 'DELETE' then
    raise exception 'request conversations cannot be deleted' using errcode = '55000';
  end if;

  if new.id is distinct from old.id
     or new.request_id is distinct from old.request_id
     or new.requester_id is distinct from old.requester_id
     or new.selected_user_id is distinct from old.selected_user_id
     or new.created_at is distinct from old.created_at
  then
    raise exception 'request conversation identity cannot be modified' using errcode = '55000';
  end if;

  return new;
end;
$$;

ALTER FUNCTION "public"."guard_request_conversation_immutable"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."guard_request_message_columns"() RETURNS "trigger"
  LANGUAGE "plpgsql"
  SET "search_path" TO ''
  AS $$
declare
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_actor uuid := (select auth.uid());
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
    if new.message_type is distinct from 'text'::public.conversation_message_type then
      raise exception 'only text messages are supported' using errcode = '22023';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.message_type is distinct from old.message_type
     or new.body is distinct from old.body
     or new.created_at is distinct from old.created_at
     or new.updated_at is distinct from old.updated_at
  then
    raise exception 'only read_at may be updated' using errcode = '55000';
  end if;

  if old.sender_id = v_actor then
    raise exception 'sender cannot mark their own message read' using errcode = '42501';
  end if;

  if v_actor is distinct from v_requester_id and v_actor is distinct from v_selected_user_id then
    raise exception 'not a conversation participant' using errcode = '42501';
  end if;

  return new;
end;
$$;

ALTER FUNCTION "public"."guard_request_message_columns"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."touch_request_conversation_on_message"() RETURNS "trigger"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
begin
  update public.request_conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

ALTER FUNCTION "public"."touch_request_conversation_on_message"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."create_request_conversation_for_handshake"() RETURNS "trigger"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_request public.requests%rowtype;
begin
  select *
    into v_request
  from public.requests r
  where r.id = new.request_id;

  if v_request.id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_request.requester_id is distinct from new.requester_id
     or v_request.selected_user_id is distinct from new.selected_user_id then
    raise exception 'handshake does not match request selection' using errcode = '55000';
  end if;

  if v_request.selected_user_id is null then
    raise exception 'request has no selected responder' using errcode = '55000';
  end if;

  insert into public.request_conversations (
    request_id,
    requester_id,
    selected_user_id,
    created_at,
    updated_at
  )
  values (
    new.request_id,
    new.requester_id,
    new.selected_user_id,
    new.created_at,
    now()
  )
  on conflict (request_id) do nothing;

  return new;
end;
$$;

ALTER FUNCTION "public"."create_request_conversation_for_handshake"() OWNER TO "postgres";

CREATE OR REPLACE TRIGGER "handshakes_create_request_conversation"
  AFTER INSERT ON "public"."handshakes"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."create_request_conversation_for_handshake"();

CREATE OR REPLACE TRIGGER "request_conversations_guard_immutable"
  BEFORE DELETE OR UPDATE ON "public"."request_conversations"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."guard_request_conversation_immutable"();

CREATE OR REPLACE TRIGGER "request_conversations_touch_updated_at"
  BEFORE UPDATE ON "public"."request_conversations"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."touch_updated_at"();

CREATE OR REPLACE TRIGGER "request_messages_guard_columns"
  BEFORE INSERT OR UPDATE ON "public"."request_messages"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."guard_request_message_columns"();

CREATE OR REPLACE TRIGGER "request_messages_touch_updated_at"
  BEFORE UPDATE ON "public"."request_messages"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."touch_updated_at"();

CREATE OR REPLACE TRIGGER "request_messages_touch_conversation"
  AFTER INSERT ON "public"."request_messages"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."touch_request_conversation_on_message"();

INSERT INTO "public"."request_conversations" (
  "request_id",
  "requester_id",
  "selected_user_id",
  "created_at",
  "updated_at"
)
SELECT
  h.request_id,
  h.requester_id,
  h.selected_user_id,
  h.created_at,
  h.created_at
FROM "public"."handshakes" h
ON CONFLICT ("request_id") DO NOTHING;

ALTER TABLE "public"."request_conversations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."request_messages" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "request_conversations_select_participant" ON "public"."request_conversations"
  FOR SELECT TO "authenticated"
  USING (
    public.conversation_participant("requester_id", "selected_user_id")
  );

CREATE POLICY "request_messages_select_participant" ON "public"."request_messages"
  FOR SELECT TO "authenticated"
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."request_conversations" c
      WHERE c.id = "request_messages"."conversation_id"
        AND public.conversation_participant(c.requester_id, c.selected_user_id)
    )
  );

CREATE POLICY "request_messages_insert_participant" ON "public"."request_messages"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "sender_id" = (SELECT "auth"."uid"() AS "uid")
    AND EXISTS (
      SELECT 1
      FROM "public"."request_conversations" c
      WHERE c.id = "conversation_id"
        AND public.conversation_participant(c.requester_id, c.selected_user_id)
    )
  );

CREATE POLICY "request_messages_update_recipient_read" ON "public"."request_messages"
  FOR UPDATE TO "authenticated"
  USING (
    EXISTS (
      SELECT 1
      FROM "public"."request_conversations" c
      WHERE c.id = "request_messages"."conversation_id"
        AND public.conversation_participant(c.requester_id, c.selected_user_id)
        AND "request_messages"."sender_id" IS DISTINCT FROM (SELECT "auth"."uid"() AS "uid")
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "public"."request_conversations" c
      WHERE c.id = "conversation_id"
        AND public.conversation_participant(c.requester_id, c.selected_user_id)
        AND "sender_id" IS DISTINCT FROM (SELECT "auth"."uid"() AS "uid")
    )
  );

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."request_messages";

GRANT SELECT ON TABLE "public"."request_conversations" TO "authenticated";
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."request_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."request_conversations" TO "service_role";
GRANT ALL ON TABLE "public"."request_messages" TO "service_role";

REVOKE ALL ON FUNCTION "public"."conversation_participant"("p_requester_id" "uuid", "p_selected_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."conversation_participant"("p_requester_id" "uuid", "p_selected_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."conversation_participant"("p_requester_id" "uuid", "p_selected_user_id" "uuid") TO "service_role";
