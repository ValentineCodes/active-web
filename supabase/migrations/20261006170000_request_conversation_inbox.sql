-- Inbox list for request-scoped conversations (Messages tab).

CREATE OR REPLACE FUNCTION "public"."list_my_request_conversations"()
RETURNS TABLE(
  "conversation_id" "uuid",
  "request_id" "uuid",
  "request_title" "text",
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
      and m.sender_id <> me.user_id
      and m.read_at is null
  ) unread on true
  order by c.updated_at desc;
$$;

ALTER FUNCTION "public"."list_my_request_conversations"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."mark_request_conversation_read"("p_conversation_id" "uuid")
RETURNS "void"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_user_id uuid := public.assert_authenticated();
begin
  update public.request_messages m
  set read_at = coalesce(m.read_at, now())
  from public.request_conversations c
  where m.conversation_id = c.id
    and c.id = p_conversation_id
    and v_user_id in (c.requester_id, c.selected_user_id)
    and m.sender_id <> v_user_id
    and m.read_at is null;
end;
$$;

ALTER FUNCTION "public"."mark_request_conversation_read"("p_conversation_id" "uuid") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_my_request_conversations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_my_request_conversations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_my_request_conversations"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."mark_request_conversation_read"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_request_conversation_read"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_request_conversation_read"("p_conversation_id" "uuid") TO "service_role";
