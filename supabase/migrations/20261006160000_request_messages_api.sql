-- List and send request-scoped chat messages for conversation participants.

CREATE OR REPLACE FUNCTION "public"."list_request_messages"(
  "p_conversation_id" "uuid",
  "p_limit" integer DEFAULT 40,
  "p_before" timestamp with time zone DEFAULT NULL
) RETURNS TABLE(
  "message_id" "uuid",
  "sender_id" "uuid",
  "message_type" "public"."conversation_message_type",
  "body" "text",
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

ALTER FUNCTION "public"."list_request_messages"(
  "p_conversation_id" "uuid",
  "p_limit" integer,
  "p_before" timestamp with time zone
) OWNER TO "postgres";

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
begin
  if v_body = '' then
    raise exception 'message cannot be empty' using errcode = '22023';
  end if;

  if char_length(v_body) > 2000 then
    raise exception 'message is too long' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.request_conversations c
    where c.id = p_conversation_id
      and v_user_id in (c.requester_id, c.selected_user_id)
  ) then
    raise exception 'conversation not found or not accessible' using errcode = '42501';
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

ALTER FUNCTION "public"."send_request_message"("p_conversation_id" "uuid", "p_body" "text") OWNER TO "postgres";

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

REVOKE ALL ON FUNCTION "public"."send_request_message"("p_conversation_id" "uuid", "p_body" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_request_message"("p_conversation_id" "uuid", "p_body" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_request_message"("p_conversation_id" "uuid", "p_body" "text") TO "service_role";
