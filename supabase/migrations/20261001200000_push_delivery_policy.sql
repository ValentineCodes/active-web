-- Push delivery policy: actionable types only, all devices, prune dead tokens.

CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";

CREATE OR REPLACE FUNCTION "public"."notification_type_should_push"(
  "p_type" "public"."notification_type"
) RETURNS boolean
  LANGUAGE "sql" IMMUTABLE
  SET "search_path" TO ''
  AS $$
  select p_type = any (
    array[
      'response_received'::public.notification_type,
      'new_responses'::public.notification_type,
      'request_expiring'::public.notification_type,
      'request_expired'::public.notification_type,
      'response_accepted'::public.notification_type,
      'response_not_selected'::public.notification_type,
      'completion_requested'::public.notification_type,
      'payment_secured'::public.notification_type,
      'funds_returned'::public.notification_type,
      'payment_released'::public.notification_type,
      'payment_received'::public.notification_type,
      'withdrawal_processing'::public.notification_type,
      'withdrawal_successful'::public.notification_type,
      'withdrawal_failed'::public.notification_type,
      'new_message'::public.notification_type,
      'missed_call'::public.notification_type,
      'request_cancelled'::public.notification_type,
      'helper_cancelled'::public.notification_type,
      'problem_reported'::public.notification_type,
      'dispute_opened'::public.notification_type,
      'dispute_resolved'::public.notification_type,
      'funds_released_after_resolution'::public.notification_type,
      'rate_experience'::public.notification_type
    ]
  );
$$;

ALTER FUNCTION "public"."notification_type_should_push"("p_type" "public"."notification_type") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."prune_invalid_expo_push_tokens"(
  "p_tokens" "text"[],
  "p_response" "jsonb"
) RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_item jsonb;
  v_index integer := 0;
  v_error text;
  v_token text;
begin
  if p_tokens is null or coalesce(array_length(p_tokens, 1), 0) = 0 then
    return;
  end if;

  if p_response is null or jsonb_typeof(p_response -> 'data') <> 'array' then
    return;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_response -> 'data') with ordinality as t(value, ord)
  loop
    v_index := v_index + 1;
    v_token := p_tokens[v_index];

    if v_token is null or v_item ->> 'status' <> 'error' then
      continue;
    end if;

    v_error := coalesce(v_item #>> '{details,error}', v_item ->> 'message', '');

    if v_error in ('DeviceNotRegistered', 'InvalidCredentials') then
      delete from public.push_tokens pt
      where pt.token = v_token;
    end if;
  end loop;
end;
$$;

ALTER FUNCTION "public"."prune_invalid_expo_push_tokens"("p_tokens" "text"[], "p_response" "jsonb") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."prune_invalid_expo_push_tokens"("p_tokens" "text"[], "p_response" "jsonb") FROM PUBLIC;

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
  "p_related_user_id" "uuid"
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
                 'related_user_id', p_related_user_id
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
      p_related_user_id
    );
  end if;

  return v_notification_id;
end;
$$;

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
      p_latest_responder_id
    );
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."wallet_withdraw"(
  "p_amount" numeric,
  "p_idempotency_key" "text"
) RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_available numeric;
  v_ledger_id uuid;
  v_currency text;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  if p_amount > 1000000 then
    raise exception 'amount exceeds the per-operation limit' using errcode = '22023';
  end if;

  perform public.ensure_wallet_account(v_user_id);

  select wa.available, wa.currency
    into v_available, v_currency
  from public.wallet_accounts wa
  where wa.user_id = v_user_id;

  if v_available < p_amount then
    raise exception 'insufficient available balance to withdraw' using errcode = '55000';
  end if;

  perform public.create_notification(
    v_user_id,
    'withdraw:' || p_idempotency_key || ':processing',
    'withdrawal_processing'::public.notification_type,
    'Withdrawal processing',
    format('We are processing your withdrawal of %s %s.', trim(to_char(p_amount, 'FM999999990.00')), v_currency),
    '/wallet',
    null,
    null,
    null,
    null,
    null,
    null,
    true
  );

  perform public.post_wallet_ledger(
    'manual_withdraw:' || p_idempotency_key,
    v_user_id,
    null,
    'manual_withdraw',
    -p_amount,
    0,
    0
  );

  select wl.id into v_ledger_id
  from public.wallet_ledger wl
  where wl.idempotency_key = 'manual_withdraw:' || p_idempotency_key;

  perform public.create_notification(
    v_user_id,
    'withdraw:' || p_idempotency_key || ':success',
    'withdrawal_successful'::public.notification_type,
    'Withdrawal successful',
    format('%s %s has been withdrawn from your available balance.', trim(to_char(p_amount, 'FM999999990.00')), v_currency),
    '/wallet',
    null,
    null,
    null,
    v_ledger_id,
    null,
    null,
    true
  );
end;
$$;

COMMENT ON FUNCTION "public"."deliver_expo_push"(
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
) IS
  'Sends Expo push to every registered device for the recipient. Persistent inbox rows are created separately and are kept even if push fails.';
