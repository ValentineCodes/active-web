-- Harden request chat authorization: handshake-bound access, RPC-only client writes.

CREATE OR REPLACE FUNCTION "public"."request_conversation_is_accessible"(
  "p_conversation_id" "uuid",
  "p_user_id" "uuid"
) RETURNS boolean
  LANGUAGE "sql"
  STABLE
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  select exists (
    select 1
    from public.request_conversations c
    join public.requests r
      on r.id = c.request_id
     and r.requester_id = c.requester_id
     and r.selected_user_id = c.selected_user_id
    join public.handshakes h
      on h.request_id = c.request_id
     and h.requester_id = c.requester_id
     and h.selected_user_id = c.selected_user_id
    where c.id = p_conversation_id
      and p_user_id in (c.requester_id, c.selected_user_id)
  );
$$;

ALTER FUNCTION "public"."request_conversation_is_accessible"("p_conversation_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."request_conversation_is_accessible"("p_conversation_id" "uuid", "p_user_id" "uuid") IS
  'True when the user is a party to a request-scoped conversation with a valid selection handshake.';

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

DROP POLICY IF EXISTS "request_conversations_select_participant" ON "public"."request_conversations";

CREATE POLICY "request_conversations_select_participant" ON "public"."request_conversations"
  FOR SELECT TO "authenticated"
  USING (
    public.request_conversation_is_accessible("id", (SELECT "auth"."uid"() AS "uid"))
  );

DROP POLICY IF EXISTS "request_messages_select_participant" ON "public"."request_messages";

CREATE POLICY "request_messages_select_participant" ON "public"."request_messages"
  FOR SELECT TO "authenticated"
  USING (
    public.request_conversation_is_accessible(
      "conversation_id",
      (SELECT "auth"."uid"() AS "uid")
    )
  );

DROP POLICY IF EXISTS "request_messages_insert_participant" ON "public"."request_messages";

DROP POLICY IF EXISTS "request_messages_update_recipient_read" ON "public"."request_messages";

CREATE POLICY "request_messages_update_recipient_read" ON "public"."request_messages"
  FOR UPDATE TO "authenticated"
  USING (
    public.request_conversation_is_accessible(
      "conversation_id",
      (SELECT "auth"."uid"() AS "uid")
    )
    AND "sender_id" IS DISTINCT FROM (SELECT "auth"."uid"() AS "uid")
  )
  WITH CHECK (
    public.request_conversation_is_accessible(
      "conversation_id",
      (SELECT "auth"."uid"() AS "uid")
    )
    AND "sender_id" IS DISTINCT FROM (SELECT "auth"."uid"() AS "uid")
  );

REVOKE INSERT, UPDATE ON TABLE "public"."request_messages" FROM "authenticated";

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
   and public.request_conversation_is_accessible(c.id, me.user_id)
  join public.request_messages m
    on m.conversation_id = c.id
   and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;

CREATE OR REPLACE FUNCTION "public"."send_request_message"(
  "p_conversation_id" "uuid",
  "p_body" "text"
) RETURNS "uuid"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_body text := btrim(p_body);
  v_message_id uuid;
  v_request_status public.request_status;
begin
  if v_body = '' then
    raise exception 'message cannot be empty' using errcode = '22023';
  end if;

  if char_length(v_body) > 2000 then
    raise exception 'message is too long' using errcode = '22023';
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

  return v_message_id;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."mark_request_conversation_read"("p_conversation_id" "uuid")
RETURNS "void"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_request_id uuid;
begin
  if not public.request_conversation_is_accessible(p_conversation_id, v_user_id) then
    raise exception 'conversation not found or not accessible' using errcode = '42501';
  end if;

  select c.request_id
    into v_request_id
  from public.request_conversations c
  where c.id = p_conversation_id;

  update public.request_messages m
  set read_at = coalesce(m.read_at, now())
  where m.conversation_id = p_conversation_id
    and m.sender_id <> v_user_id
    and m.read_at is null;

  update public.notification_inbox ni
  set read_at = now()
  where ni.user_id = v_user_id
    and ni.request_id = v_request_id
    and ni.type = 'new_message'::public.notification_type
    and ni.read_at is null;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."set_request_conversation_focus"("p_conversation_id" "uuid") RETURNS "void"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_user_id uuid := public.assert_authenticated();
begin
  if p_conversation_id is null then
    delete from public.user_conversation_focus
    where user_id = v_user_id;
    return;
  end if;

  if not public.request_conversation_is_accessible(p_conversation_id, v_user_id) then
    raise exception 'conversation not found or not accessible' using errcode = '42501';
  end if;

  insert into public.user_conversation_focus (user_id, conversation_id, updated_at)
  values (v_user_id, p_conversation_id, now())
  on conflict (user_id) do update
    set conversation_id = excluded.conversation_id,
        updated_at = excluded.updated_at;
end;
$$;

REVOKE ALL ON FUNCTION "public"."request_conversation_is_accessible"("p_conversation_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_conversation_is_accessible"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_conversation_is_accessible"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "service_role";
