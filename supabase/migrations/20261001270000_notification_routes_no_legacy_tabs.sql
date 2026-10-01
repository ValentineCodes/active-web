-- Replace legacy `/(tabs)/requests` notification targets with request-scoped routes.

DROP FUNCTION IF EXISTS "public"."deliver_expo_push"(
  "p_recipient_user_id" "uuid",
  "p_title" "text",
  "p_body" "text",
  "p_url" "text",
  "p_type" "public"."notification_type",
  "p_request_id" "uuid",
  "p_response_id" "uuid",
  "p_payment_transition_id" "uuid",
  "p_wallet_ledger_id" "uuid",
  "p_related_user_id" "uuid"
);

CREATE OR REPLACE FUNCTION "public"."deliver_expo_push"(
  "p_recipient_user_id" "uuid",
  "p_title" "text",
  "p_body" "text",
  "p_url" "text",
  "p_type" "public"."notification_type",
  "p_request_id" "uuid",
  "p_response_id" "uuid",
  "p_payment_transition_id" "uuid",
  "p_wallet_ledger_id" "uuid",
  "p_related_user_id" "uuid",
  "p_metadata" "jsonb" DEFAULT NULL
) RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_messages jsonb;
  v_chunk jsonb;
  v_chunk_tokens text[];
  v_offset integer := 0;
  v_chunk_size constant integer := 100;
  v_http extensions.http_response;
  v_response jsonb;
begin
  if not public.notification_type_should_push(p_type) then
    return;
  end if;

  if not public.user_push_delivery_allowed(p_recipient_user_id, p_type) then
    return;
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'to', t.token,
             'title', p_title,
             'body', p_body,
             'sound', 'default',
             'data', jsonb_strip_nulls(
               jsonb_build_object(
                 'url', p_url,
                 'type', p_type,
                 'request_id', p_request_id,
                 'response_id', p_response_id,
                 'payment_transition_id', p_payment_transition_id,
                 'wallet_ledger_id', p_wallet_ledger_id,
                 'related_user_id', p_related_user_id,
                 'metadata', p_metadata
               )
             )
           )
           order by t.updated_at desc
         )
    into v_messages
  from public.push_tokens t
  where t.user_id = p_recipient_user_id;

  if v_messages is null or jsonb_array_length(v_messages) = 0 then
    return;
  end if;

  while v_offset < jsonb_array_length(v_messages) loop
    select coalesce(
             jsonb_agg(entry.value order by entry.ord),
             '[]'::jsonb
           ),
           coalesce(
             array_agg(entry.value ->> 'to' order by entry.ord),
             '{}'::text[]
           )
      into v_chunk,
           v_chunk_tokens
    from jsonb_array_elements(v_messages) with ordinality as entry(value, ord)
    where entry.ord > v_offset
      and entry.ord <= v_offset + v_chunk_size;

    if jsonb_array_length(v_chunk) = 0 then
      exit;
    end if;

    v_http := extensions.http_post(
      'https://exp.host/--/api/v2/push/send',
      v_chunk::text,
      'application/json'
    );

    if v_http.status >= 200 and v_http.status < 300 then
      begin
        v_response := v_http.content::jsonb;
      exception
        when others then
          v_response := null;
      end;
      perform public.prune_invalid_expo_push_tokens(v_chunk_tokens, v_response);
    end if;

    v_offset := v_offset + v_chunk_size;
  end loop;
end;
$$;

REVOKE ALL ON FUNCTION "public"."deliver_expo_push"(
  "p_recipient_user_id" "uuid",
  "p_title" "text",
  "p_body" "text",
  "p_url" "text",
  "p_type" "public"."notification_type",
  "p_request_id" "uuid",
  "p_response_id" "uuid",
  "p_payment_transition_id" "uuid",
  "p_wallet_ledger_id" "uuid",
  "p_related_user_id" "uuid",
  "p_metadata" "jsonb"
) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."deliver_expo_push"(
  "p_recipient_user_id" "uuid",
  "p_title" "text",
  "p_body" "text",
  "p_url" "text",
  "p_type" "public"."notification_type",
  "p_request_id" "uuid",
  "p_response_id" "uuid",
  "p_payment_transition_id" "uuid",
  "p_wallet_ledger_id" "uuid",
  "p_related_user_id" "uuid",
  "p_metadata" "jsonb"
) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."create_notification"(
  "p_recipient_user_id" "uuid",
  "p_event_key" "text",
  "p_type" "public"."notification_type",
  "p_title" "text",
  "p_body" "text",
  "p_url" "text" DEFAULT NULL,
  "p_request_id" "uuid" DEFAULT NULL,
  "p_response_id" "uuid" DEFAULT NULL,
  "p_payment_transition_id" "uuid" DEFAULT NULL,
  "p_wallet_ledger_id" "uuid" DEFAULT NULL,
  "p_related_user_id" "uuid" DEFAULT NULL,
  "p_metadata" "jsonb" DEFAULT NULL,
  "p_deliver_push" boolean DEFAULT true
) RETURNS "uuid"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_dedupe_key text;
  v_notification_id uuid;
begin
  if p_recipient_user_id is null then
    return null;
  end if;

  if p_event_key is null or btrim(p_event_key) = '' then
    raise exception 'notification event_key is required' using errcode = '22023';
  end if;

  if char_length(btrim(p_title)) < 1 or char_length(btrim(p_title)) > 120 then
    raise exception 'notification title must be 1-120 characters' using errcode = '22023';
  end if;

  if char_length(p_body) > 500 then
    raise exception 'notification body must be at most 500 characters' using errcode = '22023';
  end if;

  v_dedupe_key := public.notification_dedupe_key(p_type, p_recipient_user_id, p_event_key);

  if char_length(v_dedupe_key) > 240 then
    raise exception 'notification dedupe key is too long' using errcode = '22023';
  end if;

  insert into public.notification_inbox (
    user_id,
    dedupe_key,
    type,
    title,
    body,
    url,
    request_id,
    response_id,
    payment_transition_id,
    wallet_ledger_id,
    related_user_id,
    metadata
  )
  values (
    p_recipient_user_id,
    v_dedupe_key,
    p_type,
    btrim(p_title),
    p_body,
    p_url,
    p_request_id,
    p_response_id,
    p_payment_transition_id,
    p_wallet_ledger_id,
    p_related_user_id,
    p_metadata
  )
  on conflict (dedupe_key) do nothing
  returning id into v_notification_id;

  if v_notification_id is null then
    return null;
  end if;

  if p_deliver_push and public.notification_type_should_push(p_type) then
    perform public.deliver_expo_push(
      p_recipient_user_id,
      btrim(p_title),
      p_body,
      p_url,
      p_type,
      p_request_id,
      p_response_id,
      p_payment_transition_id,
      p_wallet_ledger_id,
      p_related_user_id,
      p_metadata
    );
  end if;

  return v_notification_id;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."expire_request"("p_request_id" "uuid") RETURNS boolean
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_status public.request_status;
  v_from_status public.request_status;
  v_payment public.payment_status;
  v_expires_at timestamptz;
  v_requester_id uuid;
  v_responder_ids uuid[];
  v_responder_id uuid;
begin
  select r.status, r.payment_status, r.expires_at, r.requester_id
    into v_status, v_payment, v_expires_at, v_requester_id
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'expired' then
    return false;
  end if;

  if v_status <> 'posted' then
    return false;
  end if;

  if v_expires_at is null or v_expires_at > now() then
    return false;
  end if;

  if exists (select 1 from public.handshakes h where h.request_id = p_request_id) then
    return false;
  end if;

  v_from_status := v_status;

  select coalesce(array_agg(distinct rr.responder_id), '{}')
    into v_responder_ids
  from public.request_responses rr
  where rr.request_id = p_request_id
    and rr.status = 'pending';

  update public.request_responses
  set status = 'expired'::public.response_status,
      resolved_at = now()
  where request_id = p_request_id
    and status = 'pending';

  update public.requests
  set status = 'expired'::public.request_status
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_requester_id,
    v_from_status,
    'expired'::public.request_status,
    'expire:' || p_request_id::text
  );

  if v_payment = 'locked' then
    perform public.apply_payment_transition(
      p_request_id,
      'refunded'::public.payment_status,
      'expire:' || p_request_id::text
    );
  end if;

  perform public.create_notification(
    v_requester_id,
    'request:' || p_request_id::text || ':expired:requester',
    'request_expired'::public.notification_type,
    'Request expired',
    'This request expired before anyone was chosen. You can post it again.',
    format('/request/%s', p_request_id),
    p_request_id,
    null,
    null,
    null,
    null,
    null,
    true
  );

  foreach v_responder_id in array v_responder_ids
  loop
    perform public.create_notification(
      v_responder_id,
      'request:' || p_request_id::text || ':expired:responder:' || v_responder_id::text,
      'request_expired'::public.notification_type,
      'Request expired',
      'A request you responded to expired before anyone was chosen.',
      format('/respond/%s', p_request_id),
      p_request_id,
      null,
      null,
      null,
      null,
      jsonb_build_object('link', 'respond'),
      true
    );
  end loop;

  return true;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."finalize_request_cancellation"(
  "p_request_id" "uuid",
  "p_actor_id" "uuid",
  "p_status_event_key" "text",
  "p_payment_idempotency_key" "text"
) RETURNS boolean
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_status public.request_status;
  v_selected_user_id uuid;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_responder_ids uuid[];
  v_responder_id uuid;
begin
  if p_status_event_key is null or btrim(p_status_event_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if p_payment_idempotency_key is null or btrim(p_payment_idempotency_key) = '' then
    raise exception 'payment idempotency key is required' using errcode = '22023';
  end if;

  select r.status, r.selected_user_id, r.requester_id, r.payment_status
    into v_status, v_selected_user_id, v_requester_id, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'cancelled' then
    return false;
  end if;

  if v_status = 'completed' then
    raise exception 'a completed request cannot be cancelled' using errcode = '55000';
  end if;

  if v_status in ('expired', 'no_show', 'disputed') then
    raise exception 'a request cannot be cancelled once it is %', v_status using errcode = '55000';
  end if;

  if v_status not in ('draft', 'posted', 'accepted', 'in_progress', 'completion_pending') then
    raise exception 'a request cannot be cancelled once it is %', v_status using errcode = '55000';
  end if;

  if v_status = 'posted' then
    select coalesce(array_agg(distinct rr.responder_id), '{}')
      into v_responder_ids
    from public.request_responses rr
    where rr.request_id = p_request_id
      and rr.status = 'pending';
  end if;

  update public.request_responses
  set status = case
                 when status = 'accepted' then 'declined'::public.response_status
                 else 'expired'::public.response_status
               end,
      resolved_at = coalesce(resolved_at, now())
  where request_id = p_request_id
    and status in ('pending', 'accepted');

  update public.requests
  set status = 'cancelled',
      cancelled_at = now(),
      selected_user_id = null,
      accepted_response_id = null,
      completion_confirm_by = null
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_status,
    'cancelled'::public.request_status,
    p_status_event_key
  );

  if v_payment in ('locked', 'pending') then
    perform public.apply_payment_transition(
      p_request_id,
      'refunded'::public.payment_status,
      p_payment_idempotency_key
    );
  end if;

  if v_selected_user_id is not null then
    perform public.release_provider(v_selected_user_id);
  end if;

  if v_status = 'posted' and p_actor_id = v_requester_id then
    foreach v_responder_id in array v_responder_ids
    loop
      perform public.create_notification(
        v_responder_id,
        'cancel:' || p_status_event_key || ':responder:' || v_responder_id::text,
        'request_cancelled'::public.notification_type,
        'Request cancelled',
        'The person who posted this request cancelled it before anyone was chosen.',
        format('/respond/%s', p_request_id),
        p_request_id,
        null,
        null,
        null,
        v_requester_id,
        jsonb_build_object('link', 'respond'),
        true
      );
    end loop;
  elsif p_actor_id = v_requester_id and v_selected_user_id is not null then
    perform public.create_notification(
      v_selected_user_id,
      'cancel:' || p_status_event_key || ':helper',
      'request_cancelled'::public.notification_type,
      'Request cancelled',
      'The request was cancelled before it finished.',
      format('/engagement/%s', p_request_id),
      p_request_id,
      null,
      null,
      null,
      v_requester_id,
      null,
      true
    );
  elsif v_selected_user_id is not null and p_actor_id = v_selected_user_id then
    perform public.create_notification(
      v_requester_id,
      'cancel:' || p_status_event_key || ':helper_cancelled',
      'helper_cancelled'::public.notification_type,
      'Request cancelled',
      'The person helping you cancelled. Any set-aside payment will be returned.',
      format('/engagement/%s', p_request_id),
      p_request_id,
      null,
      null,
      null,
      v_selected_user_id,
      null,
      true
    );
  end if;

  return true;
end;
$$;

UPDATE "public"."notification_inbox" ni
SET
  url = format('/respond/%s', ni.request_id),
  metadata = coalesce(ni.metadata, '{}'::jsonb) || jsonb_build_object('link', 'respond')
WHERE ni.url = '/(tabs)/requests'
  AND ni.request_id IS NOT NULL;

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
    end;

  v_deliver_push := v_prior_count is null;

  if not v_deliver_push
     and coalesce(v_prior_count, 0) < 2
     and p_pending_count >= 2 then
    v_deliver_push := true;
  end if;

  if v_deliver_push and public.notification_type_should_push(v_type) then
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
      p_latest_responder_id,
      v_metadata
    );
  end if;
end;
$$;
