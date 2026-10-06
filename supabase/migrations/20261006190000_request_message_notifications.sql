-- new_message notifications for request-scoped chat (inbox + optional push).

CREATE TABLE IF NOT EXISTS "public"."user_conversation_focus" (
  "user_id" "uuid" NOT NULL,
  "conversation_id" "uuid" NOT NULL,
  "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  CONSTRAINT "user_conversation_focus_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "public"."user_conversation_focus" OWNER TO "postgres";

COMMENT ON TABLE "public"."user_conversation_focus" IS
  'Tracks which conversation a user is actively viewing so inbound chat can skip inbox/push noise.';

ALTER TABLE ONLY "public"."user_conversation_focus"
  ADD CONSTRAINT "user_conversation_focus_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "public"."request_conversations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."user_conversation_focus"
  ADD CONSTRAINT "user_conversation_focus_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION "public"."conversation_focus_ttl"() RETURNS interval
  LANGUAGE "sql"
  IMMUTABLE
  SET "search_path" TO ''
  AS $$
  select interval '2 minutes';
$$;

ALTER FUNCTION "public"."conversation_focus_ttl"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."recipient_is_viewing_conversation"(
  "p_recipient_user_id" "uuid",
  "p_conversation_id" "uuid"
) RETURNS boolean
  LANGUAGE "sql"
  STABLE
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  select exists (
    select 1
    from public.user_conversation_focus f
    where f.user_id = p_recipient_user_id
      and f.conversation_id = p_conversation_id
      and f.updated_at > now() - public.conversation_focus_ttl()
  );
$$;

ALTER FUNCTION "public"."recipient_is_viewing_conversation"("p_recipient_user_id" "uuid", "p_conversation_id" "uuid") OWNER TO "postgres";

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

  if not exists (
    select 1
    from public.request_conversations c
    where c.id = p_conversation_id
      and v_user_id in (c.requester_id, c.selected_user_id)
  ) then
    raise exception 'conversation not found or not accessible' using errcode = '42501';
  end if;

  insert into public.user_conversation_focus (user_id, conversation_id, updated_at)
  values (v_user_id, p_conversation_id, now())
  on conflict (user_id) do update
    set conversation_id = excluded.conversation_id,
        updated_at = excluded.updated_at;
end;
$$;

ALTER FUNCTION "public"."set_request_conversation_focus"("p_conversation_id" "uuid") OWNER TO "postgres";

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

ALTER FUNCTION "public"."notify_request_message"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "request_messages_notify" ON "public"."request_messages";

CREATE TRIGGER "request_messages_notify"
  AFTER INSERT ON "public"."request_messages"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."notify_request_message"();

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
  select c.request_id
    into v_request_id
  from public.request_conversations c
  where c.id = p_conversation_id
    and v_user_id in (c.requester_id, c.selected_user_id);

  if v_request_id is null then
    raise exception 'conversation not found or not accessible' using errcode = '42501';
  end if;

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

ALTER FUNCTION "public"."mark_request_conversation_read"("p_conversation_id" "uuid") OWNER TO "postgres";

ALTER TABLE "public"."user_conversation_focus" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_conversation_focus_select_own" ON "public"."user_conversation_focus"
  FOR SELECT TO "authenticated"
  USING (("user_id" = (SELECT "auth"."uid"() AS "uid")));

REVOKE ALL ON TABLE "public"."user_conversation_focus" FROM PUBLIC;
GRANT SELECT ON TABLE "public"."user_conversation_focus" TO "authenticated";
GRANT ALL ON TABLE "public"."user_conversation_focus" TO "service_role";

REVOKE ALL ON FUNCTION "public"."conversation_focus_ttl"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."conversation_focus_ttl"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."conversation_focus_ttl"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."recipient_is_viewing_conversation"("p_recipient_user_id" "uuid", "p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recipient_is_viewing_conversation"("p_recipient_user_id" "uuid", "p_conversation_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_request_conversation_focus"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_request_conversation_focus"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_request_conversation_focus"("p_conversation_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."notify_request_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_request_message"() TO "service_role";
