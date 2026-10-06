-- Prepare request chat for timeline system events (e.g. voice calls) without client-facing call features.

ALTER TYPE "public"."conversation_message_type" ADD VALUE IF NOT EXISTS 'system';

ALTER TABLE "public"."request_messages"
  ADD COLUMN IF NOT EXISTS "metadata" "jsonb";

COMMENT ON COLUMN "public"."request_messages"."metadata" IS
  'Structured payload for non-text rows (message_type = system). Voice call timeline events should set metadata.event = voice_call with call_id, status, and timing fields.';

CREATE OR REPLACE FUNCTION "public"."request_message_system_insert_allowed"() RETURNS boolean
  LANGUAGE "sql"
  STABLE
  SET "search_path" TO ''
  AS $$
  select coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
      or (
        coalesce((select auth.jwt() ->> 'role'), '') = ''
        and current_setting('role', true) in ('postgres', 'supabase_admin')
      );
$$;

ALTER FUNCTION "public"."request_message_system_insert_allowed"() OWNER TO "postgres";

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
    if new.message_type = 'text'::public.conversation_message_type then
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

  if v_actor is distinct from v_requester_id and v_actor is distinct from v_selected_user_id then
    raise exception 'not a conversation participant' using errcode = '42501';
  end if;

  return new;
end;
$$;

DROP POLICY IF EXISTS "request_messages_insert_participant" ON "public"."request_messages";

CREATE POLICY "request_messages_insert_participant" ON "public"."request_messages"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "message_type" = 'text'::"public"."conversation_message_type"
    AND "sender_id" = (SELECT "auth"."uid"() AS "uid")
    AND EXISTS (
      SELECT 1
      FROM "public"."request_conversations" c
      WHERE c.id = "conversation_id"
        AND public.conversation_participant(c.requester_id, c.selected_user_id)
    )
  );

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
    m.created_at,
    m.read_at
  from me
  join public.request_conversations c
    on c.id = p_conversation_id
   and me.user_id in (c.requester_id, c.selected_user_id)
  join public.request_messages m
    on m.conversation_id = c.id
   and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;

CREATE OR REPLACE FUNCTION "public"."notify_request_message"() RETURNS "trigger"
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
  if new.message_type is distinct from 'text'::public.conversation_message_type then
    return new;
  end if;

  select c.requester_id, c.selected_user_id, c.request_id
    into v_requester_id, v_selected_user_id, v_request_id
  from public.request_conversations c
  where c.id = new.conversation_id;

  if v_request_id is null then
    return new;
  end if;

  if new.sender_id = v_requester_id then
    v_recipient_id := v_selected_user_id;
  elsif new.sender_id = v_selected_user_id then
    v_recipient_id := v_requester_id;
  else
    return new;
  end if;

  if v_recipient_id is null or v_recipient_id = new.sender_id then
    return new;
  end if;

  if public.recipient_is_viewing_conversation(v_recipient_id, new.conversation_id) then
    return new;
  end if;

  select p.display_name
    into v_sender_name
  from public.profiles p
  where p.id = new.sender_id;

  v_sender_first := coalesce(public.display_first_name(v_sender_name), 'Someone');

  perform public.create_notification(
    v_recipient_id,
    'request_message:' || new.id::text,
    'new_message'::public.notification_type,
    'New message',
    format('%s sent you a message.', v_sender_first),
    format('/conversation/%s', v_request_id),
    v_request_id,
    null,
    null,
    null,
    new.sender_id,
    jsonb_build_object('message_id', new.id, 'conversation_id', new.conversation_id),
    true
  );

  return new;
end;
$$;

REVOKE ALL ON FUNCTION "public"."request_message_system_insert_allowed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_message_system_insert_allowed"() TO "service_role";

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
