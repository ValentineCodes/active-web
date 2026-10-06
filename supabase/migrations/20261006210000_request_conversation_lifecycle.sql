-- Request lifecycle rules for chat: read-only when not attending; timeline system messages.

CREATE OR REPLACE FUNCTION "public"."request_conversation_messaging_enabled"(
  "p_status" "public"."request_status"
) RETURNS boolean
  LANGUAGE "sql"
  IMMUTABLE
  SET "search_path" TO ''
  AS $$
  select p_status = any (public.attending_request_statuses());
$$;

ALTER FUNCTION "public"."request_conversation_messaging_enabled"("p_status" "public"."request_status") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."request_conversation_messaging_enabled"("p_status" "public"."request_status") IS
  'True while the request is in an active engagement status (accepted through disputed).';

CREATE OR REPLACE FUNCTION "public"."append_request_conversation_system_message"(
  "p_request_id" "uuid",
  "p_lifecycle_key" "text",
  "p_body" "text",
  "p_sender_id" "uuid"
) RETURNS "void"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_conversation_id uuid;
begin
  if p_request_id is null
     or p_lifecycle_key is null
     or btrim(p_lifecycle_key) = ''
     or p_body is null
     or btrim(p_body) = ''
     or p_sender_id is null then
    return;
  end if;

  select c.id
    into v_conversation_id
  from public.request_conversations c
  where c.request_id = p_request_id
    and p_sender_id in (c.requester_id, c.selected_user_id);

  if v_conversation_id is null then
    return;
  end if;

  if exists (
    select 1
    from public.request_messages m
    where m.conversation_id = v_conversation_id
      and m.message_type = 'system'::public.conversation_message_type
      and m.metadata ->> 'lifecycle_key' = p_lifecycle_key
  ) then
    return;
  end if;

  perform set_config('request.conversation_system_message', '1', true);

  insert into public.request_messages (
    conversation_id,
    sender_id,
    message_type,
    body,
    metadata
  )
  values (
    v_conversation_id,
    p_sender_id,
    'system'::public.conversation_message_type,
    btrim(p_body),
    jsonb_build_object(
      'event',
      'request_lifecycle',
      'lifecycle_key',
      p_lifecycle_key
    )
  );

  perform set_config('request.conversation_system_message', '', true);
end;
$$;

ALTER FUNCTION "public"."append_request_conversation_system_message"(
  "p_request_id" "uuid",
  "p_lifecycle_key" "text",
  "p_body" "text",
  "p_sender_id" "uuid"
) OWNER TO "postgres";

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

  if v_actor is distinct from v_requester_id and v_actor is distinct from v_selected_user_id then
    raise exception 'not a conversation participant' using errcode = '42501';
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."notify_request_conversation_lifecycle"() RETURNS "trigger"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_helper_name text;
  v_helper_first text;
  v_requester_id uuid;
  v_selected_user_id uuid;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  select c.requester_id, c.selected_user_id
    into v_requester_id, v_selected_user_id
  from public.request_conversations c
  where c.request_id = new.id;

  if v_requester_id is null then
    return new;
  end if;

  select p.display_name
    into v_helper_name
  from public.profiles p
  where p.id = v_selected_user_id;

  v_helper_first := coalesce(public.display_first_name(v_helper_name), 'Your helper');

  if new.status = 'completion_pending'::public.request_status
        and old.status = any (
          array[
            'accepted'::public.request_status,
            'in_progress'::public.request_status
          ]
        ) then
    perform public.append_request_conversation_system_message(
      new.id,
      'lifecycle:' || new.id::text || ':completion_pending',
      format('%s marked the request as complete.', v_helper_first),
      v_selected_user_id
    );
  elsif new.status = 'cancelled'::public.request_status then
    perform public.append_request_conversation_system_message(
      new.id,
      'lifecycle:' || new.id::text || ':cancelled',
      'This request was cancelled.',
      v_requester_id
    );
  elsif new.status = 'expired'::public.request_status then
    perform public.append_request_conversation_system_message(
      new.id,
      'lifecycle:' || new.id::text || ':expired',
      'This request expired.',
      v_requester_id
    );
  elsif new.status = 'disputed'::public.request_status then
    perform public.append_request_conversation_system_message(
      new.id,
      'lifecycle:' || new.id::text || ':disputed',
      'A problem was reported on this request.',
      v_requester_id
    );
  end if;

  return new;
end;
$$;

ALTER FUNCTION "public"."notify_request_conversation_lifecycle"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "requests_notify_conversation_lifecycle" ON "public"."requests";

CREATE TRIGGER "requests_notify_conversation_lifecycle"
  AFTER UPDATE OF "status" ON "public"."requests"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."notify_request_conversation_lifecycle"();

CREATE OR REPLACE FUNCTION "public"."notify_request_conversation_payment_secured"() RETURNS "trigger"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_requester_id uuid;
begin
  if new.to_status is distinct from 'locked'::public.payment_status then
    return new;
  end if;

  if new.idempotency_key not like 'handshake:%'
     and new.idempotency_key not like 'create:%' then
    return new;
  end if;

  select r.requester_id
    into v_requester_id
  from public.requests r
  where r.id = new.request_id;

  if v_requester_id is null then
    return new;
  end if;

  perform public.append_request_conversation_system_message(
    new.request_id,
    'lifecycle:' || new.request_id::text || ':payment_secured',
    'Payment has been secured.',
    v_requester_id
  );

  return new;
end;
$$;

ALTER FUNCTION "public"."notify_request_conversation_payment_secured"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "payment_transitions_notify_conversation" ON "public"."payment_transitions";

CREATE TRIGGER "payment_transitions_notify_conversation"
  AFTER INSERT ON "public"."payment_transitions"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."notify_request_conversation_payment_secured"();

DROP FUNCTION IF EXISTS "public"."get_request_conversation"("p_request_id" "uuid");

CREATE OR REPLACE FUNCTION "public"."get_request_conversation"("p_request_id" "uuid")
RETURNS TABLE(
  "conversation_id" "uuid",
  "request_id" "uuid",
  "requester_id" "uuid",
  "selected_user_id" "uuid",
  "request_status" "public"."request_status",
  "messaging_enabled" boolean,
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone
)
  LANGUAGE "sql"
  STABLE
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  with me as (select public.assert_authenticated() as user_id)
  select
    c.id,
    c.request_id,
    c.requester_id,
    c.selected_user_id,
    r.status,
    public.request_conversation_messaging_enabled(r.status),
    c.created_at,
    c.updated_at
  from me
  join public.request_conversations c
    on c.request_id = p_request_id
   and me.user_id in (c.requester_id, c.selected_user_id)
  join public.handshakes h
    on h.request_id = c.request_id
   and h.requester_id = c.requester_id
   and h.selected_user_id = c.selected_user_id
  join public.requests r
    on r.id = c.request_id
   and r.selected_user_id = c.selected_user_id;
$$;

DROP FUNCTION IF EXISTS "public"."list_my_request_conversations"();

CREATE OR REPLACE FUNCTION "public"."list_my_request_conversations"()
RETURNS TABLE(
  "conversation_id" "uuid",
  "request_id" "uuid",
  "request_title" "text",
  "request_status" "public"."request_status",
  "messaging_enabled" boolean,
  "counterparty_id" "uuid",
  "counterparty_display_name" "text",
  "counterparty_avatar_path" "text",
  "counterparty_avatar_captured_in_app" boolean,
  "latest_message_body" "text",
  "latest_message_at" timestamp with time zone,
  "latest_message_sender_id" "uuid",
  "unread_count" integer,
  "updated_at" timestamp with time zone
)
  LANGUAGE "sql"
  STABLE
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  with me as (select public.assert_authenticated() as user_id)
  select
    c.id,
    c.request_id,
    r.title,
    r.status,
    public.request_conversation_messaging_enabled(r.status),
    case
      when me.user_id = c.requester_id then c.selected_user_id
      else c.requester_id
    end,
    p.display_name,
    p.avatar_path,
    p.avatar_captured_in_app,
    latest.body,
    latest.created_at,
    latest.sender_id,
    coalesce(unread.count, 0),
    c.updated_at
  from me
  join public.request_conversations c
    on me.user_id in (c.requester_id, c.selected_user_id)
  join public.handshakes h
    on h.request_id = c.request_id
   and h.requester_id = c.requester_id
   and h.selected_user_id = c.selected_user_id
  join public.requests r
    on r.id = c.request_id
   and r.selected_user_id = c.selected_user_id
  join public.profiles p
    on p.id = case
      when me.user_id = c.requester_id then c.selected_user_id
      else c.requester_id
    end
  left join lateral (
    select m.body, m.created_at, m.sender_id
    from public.request_messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*)::integer as count
    from public.request_messages m
    where m.conversation_id = c.id
      and m.message_type = 'text'::public.conversation_message_type
      and m.sender_id <> me.user_id
      and m.read_at is null
  ) unread on true
  order by c.updated_at desc;
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

  select r.status
    into v_request_status
  from public.request_conversations c
  join public.requests r on r.id = c.request_id
  where c.id = p_conversation_id
    and v_user_id in (c.requester_id, c.selected_user_id);

  if v_request_status is null then
    raise exception 'conversation not found or not accessible' using errcode = '42501';
  end if;

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

REVOKE ALL ON FUNCTION "public"."request_conversation_messaging_enabled"("p_status" "public"."request_status") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_conversation_messaging_enabled"("p_status" "public"."request_status") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_conversation_messaging_enabled"("p_status" "public"."request_status") TO "service_role";

REVOKE ALL ON FUNCTION "public"."append_request_conversation_system_message"(
  "p_request_id" "uuid",
  "p_lifecycle_key" "text",
  "p_body" "text",
  "p_sender_id" "uuid"
) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."append_request_conversation_system_message"(
  "p_request_id" "uuid",
  "p_lifecycle_key" "text",
  "p_body" "text",
  "p_sender_id" "uuid"
) TO "service_role";

REVOKE ALL ON FUNCTION "public"."notify_request_conversation_lifecycle"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_request_conversation_lifecycle"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."notify_request_conversation_payment_secured"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_request_conversation_payment_secured"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_request_conversation"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_request_conversation"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_request_conversation"("p_request_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."list_my_request_conversations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_my_request_conversations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_my_request_conversations"() TO "service_role";

CREATE OR REPLACE FUNCTION "public"."ensure_request_conversation"(
  "p_request_id" "uuid",
  "p_requester_id" "uuid",
  "p_selected_user_id" "uuid"
) RETURNS "uuid"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_request public.requests%rowtype;
  v_conversation_id uuid;
  v_helper_name text;
  v_helper_first text;
begin
  if p_request_id is null
     or p_requester_id is null
     or p_selected_user_id is null then
    raise exception 'conversation participants are required' using errcode = '22023';
  end if;

  if p_requester_id = p_selected_user_id then
    raise exception 'conversation requires two distinct participants' using errcode = '22023';
  end if;

  select *
    into v_request
  from public.requests r
  where r.id = p_request_id;

  if v_request.id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_request.requester_id is distinct from p_requester_id
     or v_request.selected_user_id is distinct from p_selected_user_id then
    raise exception 'conversation does not match request selection' using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.handshakes h
    where h.request_id = p_request_id
      and h.requester_id = p_requester_id
      and h.selected_user_id = p_selected_user_id
  ) then
    raise exception 'conversation requires a completed selection handshake' using errcode = '55000';
  end if;

  insert into public.request_conversations (
    request_id,
    requester_id,
    selected_user_id,
    created_at,
    updated_at
  )
  values (
    p_request_id,
    p_requester_id,
    p_selected_user_id,
    now(),
    now()
  )
  on conflict (request_id) do nothing;

  select c.id
    into v_conversation_id
  from public.request_conversations c
  where c.request_id = p_request_id;

  if v_conversation_id is null then
    raise exception 'conversation could not be created' using errcode = '55000';
  end if;

  select p.display_name
    into v_helper_name
  from public.profiles p
  where p.id = p_selected_user_id;

  v_helper_first := coalesce(public.display_first_name(v_helper_name), 'Your helper');

  perform public.append_request_conversation_system_message(
    p_request_id,
    'lifecycle:' || p_request_id::text || ':selected',
    format('%s was selected to help with this request.', v_helper_first),
    p_requester_id
  );

  return v_conversation_id;
end;
$$;
