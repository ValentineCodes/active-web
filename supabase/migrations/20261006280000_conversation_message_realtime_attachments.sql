-- Realtime attachment delivery + new_message notification copy for attachment messages.

CREATE OR REPLACE FUNCTION "public"."new_message_notification_body"(
  "p_message_id" "uuid",
  "p_body" "text",
  "p_sender_first" "text"
) RETURNS "text"
  LANGUAGE "plpgsql"
  STABLE
  SET "search_path" TO ''
  AS $$
declare
  v_image integer := 0;
  v_video integer := 0;
  v_file integer := 0;
begin
  select
    count(*) filter (where a.attachment_type = 'image'::public.conversation_attachment_type),
    count(*) filter (where a.attachment_type = 'video'::public.conversation_attachment_type),
    count(*) filter (where a.attachment_type = 'file'::public.conversation_attachment_type)
    into v_image, v_video, v_file
  from public.request_message_attachments a
  where a.message_id = p_message_id
    and a.uploaded_at is not null;

  if v_image + v_video + v_file = 0 then
    return format('%s sent you a message.', p_sender_first);
  end if;

  if btrim(coalesce(p_body, '')) <> '' then
    return format('%s sent you a message.', p_sender_first);
  end if;

  if v_image > 0 and v_video = 0 and v_file = 0 then
    return format('%s sent you a photo.', p_sender_first);
  end if;

  if v_video > 0 and v_image = 0 and v_file = 0 then
    return format('%s sent you a video.', p_sender_first);
  end if;

  if v_file > 0 and v_image = 0 and v_video = 0 then
    return format('%s sent you a file.', p_sender_first);
  end if;

  return format('%s sent you a message.', p_sender_first);
end;
$$;

ALTER FUNCTION "public"."new_message_notification_body"("p_message_id" "uuid", "p_body" "text", "p_sender_first" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_request_message_for_viewer"("p_message_id" "uuid")
RETURNS TABLE(
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
  join public.request_messages m on m.id = p_message_id
  join public.request_conversations c on c.id = m.conversation_id
  where public.request_conversation_is_accessible(c.id, me.user_id);
$$;

ALTER FUNCTION "public"."get_request_message_for_viewer"("p_message_id" "uuid") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_request_message_for_viewer"("p_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_request_message_for_viewer"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_request_message_for_viewer"("p_message_id" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."notify_request_message_dispatch"("p_message" "public"."request_messages")
RETURNS "void"
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
  v_body text;
begin
  select c.requester_id, c.selected_user_id, c.request_id
    into v_requester_id, v_selected_user_id, v_request_id
  from public.request_conversations c
  where c.id = p_message.conversation_id;

  if v_request_id is null then
    return;
  end if;

  if p_message.sender_id = v_requester_id then
    v_recipient_id := v_selected_user_id;
  elsif p_message.sender_id = v_selected_user_id then
    v_recipient_id := v_requester_id;
  else
    return;
  end if;

  if v_recipient_id is null or v_recipient_id = p_message.sender_id then
    return;
  end if;

  if public.recipient_is_viewing_conversation(v_recipient_id, p_message.conversation_id) then
    return;
  end if;

  select p.display_name
    into v_sender_name
  from public.profiles p
  where p.id = p_message.sender_id;

  v_sender_first := coalesce(public.display_first_name(v_sender_name), 'Someone');
  v_body := public.new_message_notification_body(p_message.id, p_message.body, v_sender_first);

  perform public.create_notification(
    v_recipient_id,
    'request_message:' || p_message.id::text,
    'new_message'::public.notification_type,
    'New message',
    v_body,
    format('/conversation/%s', v_request_id),
    v_request_id,
    null,
    null,
    null,
    p_message.sender_id,
    jsonb_build_object('message_id', p_message.id, 'conversation_id', p_message.conversation_id),
    true
  );
end;
$$;

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."request_message_attachments";
