-- Consolidate request response notifications into one inbox row per request.

CREATE OR REPLACE FUNCTION "public"."request_response_notifications_dedupe_key"(
  "p_requester_id" "uuid",
  "p_request_id" "uuid"
) RETURNS "text"
  LANGUAGE "sql" IMMUTABLE
  SET "search_path" TO ''
  AS $$
  select 'pending_responses:' || p_requester_id::text || ':' || p_request_id::text;
$$;

ALTER FUNCTION "public"."request_response_notifications_dedupe_key"("p_requester_id" "uuid", "p_request_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."upsert_request_response_notification"(
  "p_requester_id" "uuid",
  "p_request_id" "uuid",
  "p_latest_response_id" "uuid",
  "p_latest_responder_id" "uuid",
  "p_pending_count" integer
) RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_dedupe_key text;
  v_type "public"."notification_type";
  v_title text;
  v_body text;
  v_request_title text;
  v_url text;
  v_metadata jsonb;
  v_prior_count integer;
  v_deliver_push boolean := false;
  v_notification_id uuid;
begin
  if p_requester_id is null or p_request_id is null then
    return;
  end if;

  if p_pending_count < 1 then
    return;
  end if;

  select left(btrim(r.title), 80)
    into v_request_title
  from public.requests r
  where r.id = p_request_id;

  if v_request_title is null then
    return;
  end if;

  v_dedupe_key := public.request_response_notifications_dedupe_key(p_requester_id, p_request_id);
  v_url := format('/request/%s', p_request_id);
  v_metadata := jsonb_build_object('pending_response_count', p_pending_count);

  if p_pending_count = 1 then
    v_type := 'response_received'::public.notification_type;
    v_title := 'Someone responded';
    v_body := format(
      'Someone offered to help with "%s".',
      replace(v_request_title, '"', '''')
    );
  else
    v_type := 'new_responses'::public.notification_type;
    v_title := 'New responses';
    v_body := format('You have %s people offering to help.', p_pending_count);
  end if;

  select (ni.metadata ->> 'pending_response_count')::integer
    into v_prior_count
  from public.notification_inbox ni
  where ni.dedupe_key = v_dedupe_key;

  insert into public.notification_inbox (
    user_id,
    dedupe_key,
    type,
    title,
    body,
    url,
    request_id,
    response_id,
    related_user_id,
    metadata
  )
  values (
    p_requester_id,
    v_dedupe_key,
    v_type,
    v_title,
    v_body,
    v_url,
    p_request_id,
    p_latest_response_id,
    p_latest_responder_id,
    v_metadata
  )
  on conflict (dedupe_key) do update
  set
    type = excluded.type,
    title = excluded.title,
    body = excluded.body,
    url = excluded.url,
    request_id = excluded.request_id,
    response_id = excluded.response_id,
    related_user_id = excluded.related_user_id,
    metadata = excluded.metadata,
    read_at = case
      when coalesce((public.notification_inbox.metadata ->> 'pending_response_count')::integer, 0)
             < p_pending_count
        then null
      else public.notification_inbox.read_at
    end,
    created_at = case
      when coalesce((public.notification_inbox.metadata ->> 'pending_response_count')::integer, 0)
             < p_pending_count
        then now()
      else public.notification_inbox.created_at
    end
  returning id into v_notification_id;

  v_deliver_push := v_prior_count is null;

  if not v_deliver_push
     and coalesce(v_prior_count, 0) < 2
     and p_pending_count >= 2 then
    v_deliver_push := true;
  end if;

  if v_deliver_push then
    perform public.deliver_expo_push(
      p_requester_id,
      v_title,
      v_body,
      v_url,
      v_type,
      p_request_id,
      p_latest_response_id,
      null,
      null,
      p_latest_responder_id
    );
  end if;
end;
$$;

ALTER FUNCTION "public"."upsert_request_response_notification"(
  "p_requester_id" "uuid",
  "p_request_id" "uuid",
  "p_latest_response_id" "uuid",
  "p_latest_responder_id" "uuid",
  "p_pending_count" integer
) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."upsert_request_response_notification"(
  "p_requester_id" "uuid",
  "p_request_id" "uuid",
  "p_latest_response_id" "uuid",
  "p_latest_responder_id" "uuid",
  "p_pending_count" integer
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION "public"."notify_requester_of_response"() RETURNS "trigger"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_requester_id uuid;
  v_pending_count integer;
begin
  if new.status <> 'pending'::public.response_status then
    return new;
  end if;

  select r.requester_id into v_requester_id
  from public.requests r
  where r.id = new.request_id;

  if v_requester_id is null then
    return new;
  end if;

  select count(*)::integer into v_pending_count
  from public.request_responses rr
  where rr.request_id = new.request_id
    and rr.status = 'pending';

  perform public.upsert_request_response_notification(
    v_requester_id,
    new.request_id,
    new.id,
    new.responder_id,
    v_pending_count
  );

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."mark_request_response_notifications_read"("p_request_id" "uuid") RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_user_id uuid := public.assert_authenticated();
begin
  if p_request_id is null then
    raise exception 'request id is required' using errcode = '22023';
  end if;

  update public.notification_inbox
  set read_at = now()
  where user_id = v_user_id
    and request_id = p_request_id
    and type = any (
      array[
        'response_received'::public.notification_type,
        'new_responses'::public.notification_type
      ]
    )
    and read_at is null;
end;
$$;

ALTER FUNCTION "public"."mark_request_response_notifications_read"("p_request_id" "uuid") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."mark_request_response_notifications_read"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_request_response_notifications_read"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_request_response_notifications_read"("p_request_id" "uuid") TO "service_role";
