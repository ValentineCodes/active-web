-- Central notification service: idempotent inbox rows + optional Expo push.
-- Business code must call create_notification only (not insert into notification_inbox).

ALTER TABLE "public"."notification_inbox"
  ADD COLUMN "dedupe_key" "text";

UPDATE "public"."notification_inbox"
SET "dedupe_key" = 'legacy:' || "id"::"text"
WHERE "dedupe_key" IS NULL;

ALTER TABLE "public"."notification_inbox"
  ALTER COLUMN "dedupe_key" SET NOT NULL;

ALTER TABLE ONLY "public"."notification_inbox"
  ADD CONSTRAINT "notification_inbox_dedupe_key_key" UNIQUE ("dedupe_key");

COMMENT ON COLUMN "public"."notification_inbox"."dedupe_key" IS
  'Stable idempotency key: {type}:{recipient_user_id}:{event_key}. One row per business event per recipient.';

REVOKE INSERT, UPDATE, DELETE ON TABLE "public"."notification_inbox" FROM "authenticated";

CREATE OR REPLACE FUNCTION "public"."notification_dedupe_key"(
  "p_type" "public"."notification_type",
  "p_recipient_user_id" "uuid",
  "p_event_key" "text"
) RETURNS "text"
  LANGUAGE "sql" IMMUTABLE
  SET "search_path" TO ''
  AS $$
  select p_type::text || ':' || p_recipient_user_id::text || ':' || btrim(p_event_key);
$$;

ALTER FUNCTION "public"."notification_dedupe_key"(
  "p_type" "public"."notification_type",
  "p_recipient_user_id" "uuid",
  "p_event_key" "text"
) OWNER TO "postgres";

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
begin
  select jsonb_build_array(
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
         )
    into v_messages
  from public.push_tokens t
  where t.user_id = p_recipient_user_id;

  if v_messages is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_messages
  );
end;
$$;

ALTER FUNCTION "public"."deliver_expo_push"(
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
) OWNER TO "postgres";

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
  "p_related_user_id" "uuid"
) FROM PUBLIC;

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

  if p_deliver_push then
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

ALTER FUNCTION "public"."create_notification"(
  "p_recipient_user_id" "uuid",
  "p_event_key" "text",
  "p_type" "public"."notification_type",
  "p_title" "text",
  "p_body" "text",
  "p_url" "text",
  "p_request_id" "uuid",
  "p_response_id" "uuid",
  "p_payment_transition_id" "uuid",
  "p_wallet_ledger_id" "uuid",
  "p_related_user_id" "uuid",
  "p_metadata" "jsonb",
  "p_deliver_push" boolean
) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."create_notification"(
  "p_recipient_user_id" "uuid",
  "p_event_key" "text",
  "p_type" "public"."notification_type",
  "p_title" "text",
  "p_body" "text",
  "p_url" "text",
  "p_request_id" "uuid",
  "p_response_id" "uuid",
  "p_payment_transition_id" "uuid",
  "p_wallet_ledger_id" "uuid",
  "p_related_user_id" "uuid",
  "p_metadata" "jsonb",
  "p_deliver_push" boolean
) IS
  'Single entry point for persistent notifications. p_event_key identifies the underlying event (payment transition id, idempotency key, response id, etc.). Retries with the same key do not duplicate inbox rows or push.';

REVOKE ALL ON FUNCTION "public"."create_notification"(
  "p_recipient_user_id" "uuid",
  "p_event_key" "text",
  "p_type" "public"."notification_type",
  "p_title" "text",
  "p_body" "text",
  "p_url" "text",
  "p_request_id" "uuid",
  "p_response_id" "uuid",
  "p_payment_transition_id" "uuid",
  "p_wallet_ledger_id" "uuid",
  "p_related_user_id" "uuid",
  "p_metadata" "jsonb",
  "p_deliver_push" boolean
) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."create_notification"(
  "p_recipient_user_id" "uuid",
  "p_event_key" "text",
  "p_type" "public"."notification_type",
  "p_title" "text",
  "p_body" "text",
  "p_url" "text",
  "p_request_id" "uuid",
  "p_response_id" "uuid",
  "p_payment_transition_id" "uuid",
  "p_wallet_ledger_id" "uuid",
  "p_related_user_id" "uuid",
  "p_metadata" "jsonb",
  "p_deliver_push" boolean
) TO "service_role";

DROP FUNCTION IF EXISTS "public"."send_push"(
  "p_recipient_user_ids" "uuid"[],
  "p_type" "public"."notification_type",
  "p_title" "text",
  "p_body" "text",
  "p_url" "text",
  "p_request_id" "uuid",
  "p_response_id" "uuid",
  "p_payment_transition_id" "uuid",
  "p_wallet_ledger_id" "uuid",
  "p_related_user_id" "uuid",
  "p_metadata" "jsonb"
);

CREATE OR REPLACE FUNCTION "public"."notify_payment_transition"() RETURNS "trigger"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_requester_id uuid;
  v_total numeric;
  v_currency text;
begin
  select r.requester_id, r.currency
    into v_requester_id, v_currency
  from public.requests r
  where r.id = new.request_id;

  select re.total into v_total
  from public.request_escrow re
  where re.request_id = new.request_id;

  if new.to_status = 'locked'::public.payment_status
     and new.idempotency_key like 'create:%' then
    perform public.create_notification(
      v_requester_id,
      'payment_transition:' || new.id::text,
      'payment_secured'::public.notification_type,
      'Offer set aside',
      coalesce(
        format('We set aside %s %s for this request.', v_total, v_currency),
        'Your offer is set aside for this request.'
      ),
      format('/request/%s', new.request_id),
      new.request_id,
      null,
      new.id,
      null,
      null,
      null,
      true
    );
  elsif new.to_status = 'refunded'::public.payment_status then
    perform public.create_notification(
      v_requester_id,
      'payment_transition:' || new.id::text,
      'funds_returned'::public.notification_type,
      'Payment returned',
      coalesce(
        format('%s %s was returned to your wallet.', v_total, v_currency),
        'Your payment has been returned to your wallet.'
      ),
      '/wallet',
      new.request_id,
      null,
      new.id,
      null,
      null,
      null,
      true
    );
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."notify_provider_of_acceptance"() RETURNS "trigger"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_requester_name text;
  v_requester_first text;
begin
  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = new.requester_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'them');

  perform public.create_notification(
      new.selected_user_id,
      'request:' || new.id::text || ':accepted',
      'response_accepted'::public.notification_type,
    format('You''re helping %s now', v_requester_first),
    'Open the request for contact details and where to meet.',
    format('/engagement/%s', new.id),
    new.id,
    new.accepted_response_id,
    null,
    null,
    new.requester_id,
    null,
      true
    );

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."notify_requester_of_completion_pending"() RETURNS "trigger"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_helper_name text;
  v_helper_first text;
begin
  if new.status <> 'completion_pending'::public.request_status
     or old.status = new.status then
    return new;
  end if;

  select p.display_name into v_helper_name
  from public.profiles p
  where p.id = new.selected_user_id;

  v_helper_first := coalesce(public.display_first_name(v_helper_name), 'Your helper');

  perform public.create_notification(
      new.requester_id,
      'request:' || new.id::text || ':completion_pending',
      'completion_requested'::public.notification_type,
    'Confirm completion',
    format('%s says the request is complete.', v_helper_first),
    format('/engagement/%s', new.id),
    new.id,
    new.accepted_response_id,
    null,
    null,
    new.selected_user_id,
    null,
      true
    );

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."notify_requester_of_provider_selected"() RETURNS "trigger"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
begin
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."notify_requester_of_response"() RETURNS "trigger"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_requester_id uuid;
  v_responder_name text;
  v_responder_first text;
  v_pending_count integer;
  v_type public.notification_type;
  v_title text;
  v_body text;
begin
  if new.status <> 'pending'::public.response_status then
    return new;
  end if;

  select r.requester_id into v_requester_id
  from public.requests r
  where r.id = new.request_id;

  select p.display_name into v_responder_name
  from public.profiles p
  where p.id = new.responder_id;

  v_responder_first := coalesce(public.display_first_name(v_responder_name), 'Someone');

  select count(*)::integer into v_pending_count
  from public.request_responses rr
  where rr.request_id = new.request_id
    and rr.status = 'pending';

  if v_pending_count <= 1 then
    v_type := 'response_received'::public.notification_type;
    v_title := 'New response';
    v_body := format('%s wants to help with your request.', v_responder_first);
  else
    v_type := 'new_responses'::public.notification_type;
    v_title := 'New response';
    v_body := format(
      '%s responded. You now have %s responses to review.',
      v_responder_first,
      v_pending_count
    );
  end if;

  perform public.create_notification(
      v_requester_id,
      'response:' || new.id::text,
      v_type,
    v_title,
    v_body,
    format('/request/%s', new.request_id),
    new.request_id,
    new.id,
    null,
    null,
    new.responder_id,
    jsonb_build_object('pending_response_count', v_pending_count),
      true
    );

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."notify_requester_request_published"() RETURNS "trigger"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
begin
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."notify_responder_of_response_submitted"() RETURNS "trigger"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
begin
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."notify_responders_not_chosen"("p_request_id" "uuid", "p_chosen_response_id" "uuid") RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_requester_name text;
  v_requester_first text;
  v_row record;
begin
  select p.display_name into v_requester_name
  from public.profiles p
  join public.requests r on r.requester_id = p.id
  where r.id = p_request_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'The requester');

  for v_row in
    select rr.id, rr.responder_id
    from public.request_responses rr
    where rr.request_id = p_request_id
      and rr.id <> p_chosen_response_id
      and rr.status = 'declined'::public.response_status
  loop
    perform public.create_notification(
      v_row.responder_id,
      'response:' || v_row.id::text || ':not_selected',
      'response_not_selected'::public.notification_type,
      'Someone else was chosen',
      format('%s chose someone else for this request.', v_requester_first),
      '/(tabs)/requests',
      p_request_id,
      v_row.id,
      null,
      null,
      (select r.requester_id from public.requests r where r.id = p_request_id),
      null,
      true
    );
  end loop;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."notify_completion_reminders"("p_limit" integer DEFAULT 100) RETURNS integer
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_row record;
  v_notified integer := 0;
begin
  if p_limit < 1 then
    raise exception 'limit must be at least 1' using errcode = '22023';
  end if;

  for v_row in
    select r.id, r.requester_id, r.accepted_response_id
    from public.requests r
    where r.status = 'completion_pending'::public.request_status
      and r.completion_confirm_by > now()
      and r.completion_confirm_by <= now() + interval '24 hours'
      and r.completion_reminder_sent_at is null
    order by r.completion_confirm_by
    limit p_limit
    for update skip locked
  loop
    perform public.create_notification(
      v_row.requester_id,
      'request:' || v_row.id::text || ':completion_reminder',
      'completion_requested'::public.notification_type,
      'Please confirm',
      'Your helper says the request is complete. Confirm or report a problem soon.',
      format('/engagement/%s', v_row.id),
      v_row.id,
      v_row.accepted_response_id,
      null,
      null,
      null,
      jsonb_build_object('reminder', true),
      true
    );

    update public.requests
    set completion_reminder_sent_at = now()
    where id = v_row.id;

    v_notified := v_notified + 1;
  end loop;

  return v_notified;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."notify_expiring_requests"("p_limit" integer DEFAULT 100) RETURNS integer
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_row record;
  v_notified integer := 0;
begin
  if p_limit < 1 then
    raise exception 'limit must be at least 1' using errcode = '22023';
  end if;

  for v_row in
    select r.id, r.requester_id
    from public.requests r
    where r.status = 'posted'::public.request_status
      and r.expires_at > now()
      and r.expires_at <= now() + interval '2 hours'
      and r.expiry_reminder_sent_at is null
      and not exists (select 1 from public.handshakes h where h.request_id = r.id)
    order by r.expires_at
    limit p_limit
    for update skip locked
  loop
    perform public.create_notification(
      v_row.requester_id,
      'request:' || v_row.id::text || ':expiring',
      'request_expiring'::public.notification_type,
      'Expiring soon',
      'Your request expires in about two hours if you have not chosen someone yet.',
      format('/request/%s', v_row.id),
      v_row.id,
      null,
      null,
      null,
      null,
      null,
      true
    );

    update public.requests
    set expiry_reminder_sent_at = now()
    where id = v_row.id;

    v_notified := v_notified + 1;
  end loop;

  return v_notified;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."auto_complete_request"("p_request_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_status public.request_status;
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_confirm_by timestamptz;
  v_payment public.payment_status;
  v_requester_name text;
  v_requester_first text;
  v_finalized boolean;
begin
  select r.status, r.requester_id, r.selected_user_id, r.completion_confirm_by, r.payment_status
    into v_status, v_requester_id, v_selected_user_id, v_confirm_by, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'completed' then
    return false;
  end if;

  if v_status <> 'completion_pending' or v_payment = 'disputed' then
    return false;
  end if;

  if v_confirm_by is null or v_confirm_by > now() then
    return false;
  end if;

  v_finalized := public.finalize_request_completion(
    p_request_id,
    v_requester_id,
    'auto_complete:' || p_request_id::text
  );

  if not v_finalized then
    return false;
  end if;

  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = v_requester_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'The requester');

  perform public.create_notification(
      v_requester_id,
      'request:' || p_request_id::text || ':auto_complete:rate',
      'rate_experience'::public.notification_type,
    'Request completed',
    'The confirmation window ended, so this request was marked complete. You can still leave a rating.',
    format('/rate/%s', p_request_id),
    p_request_id,
    null,
    null,
    null,
    null,
    null,
      true
    );

  if v_selected_user_id is not null then
    perform public.create_notification(
      v_selected_user_id,
      'request:' || p_request_id::text || ':auto_complete:payment',
      'payment_received'::public.notification_type,
      'Payment released',
      format(
        '%s did not confirm in time. The request was completed automatically and your payment has been released.',
        v_requester_first
      ),
      format('/engagement/%s', p_request_id),
      p_request_id,
      null,
      null,
      null,
      v_requester_id,
      jsonb_build_object('auto_completed', true),
      true
    );
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."auto_complete_request"("p_request_id" "uuid") OWNER TO "postgres";


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
      '/(tabs)/requests',
      p_request_id,
      null,
      null,
      null,
      null,
      null,
      true
    );
  end loop;

  return true;
end;
$$;


ALTER FUNCTION "public"."expire_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_request_cancellation"("p_request_id" "uuid", "p_actor_id" "uuid", "p_status_event_key" "text", "p_payment_idempotency_key" "text") RETURNS boolean
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
        '/(tabs)/requests',
        p_request_id,
        null,
        null,
        null,
        v_requester_id,
        null,
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
    perform public.create_notification(
      v_requester_id,
      'cancel:' || p_status_event_key || ':confirmed',
      'cancellation_confirmed'::public.notification_type,
      'Cancellation confirmed',
      'You cancelled this request before it finished.',
      format('/request/%s', p_request_id),
      p_request_id,
      null,
      null,
      null,
      null,
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


ALTER FUNCTION "public"."finalize_request_cancellation"("p_request_id" "uuid", "p_actor_id" "uuid", "p_status_event_key" "text", "p_payment_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_request_completion"("p_request_id" "uuid", "p_actor_id" "uuid", "p_status_event_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_status public.request_status;
  v_selected_user_id uuid;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_requester_name text;
  v_requester_first text;
begin
  if p_status_event_key is null or btrim(p_status_event_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  select r.status, r.selected_user_id, r.requester_id, r.payment_status
    into v_status, v_selected_user_id, v_requester_id, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'completed' then
    return false;
  end if;

  if v_status <> 'completion_pending' or v_payment = 'disputed' then
    return false;
  end if;

  update public.requests
  set status = 'completed'::public.request_status,
      completed_at = now(),
      started_at = coalesce(started_at, now()),
      completion_confirm_by = null
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_status,
    'completed'::public.request_status,
    p_status_event_key
  );

  if v_payment = 'pending' then
    perform public.apply_payment_transition(
      p_request_id,
      'released'::public.payment_status,
      'complete:' || p_request_id::text
    );
  end if;

  if v_selected_user_id is not null then
    update public.profiles
    set jobs_completed = jobs_completed + 1
    where id = v_selected_user_id;

    perform public.release_provider(v_selected_user_id);
  end if;

  update public.profiles
  set requests_completed = requests_completed + 1
  where id = v_requester_id;

  if p_status_event_key like 'confirm_complete:%' and v_selected_user_id is not null then
    select p.display_name into v_requester_name
    from public.profiles p
    where p.id = v_requester_id;

    v_requester_first := coalesce(public.display_first_name(v_requester_name), 'The requester');

    perform public.create_notification(
      v_selected_user_id,
      'confirm_complete:' || p_request_id::text,
      'payment_received'::public.notification_type,
      'Payment released',
      format(
        '%s confirmed the request is complete. Your payment has been released.',
        v_requester_first
      ),
      format('/engagement/%s', p_request_id),
      p_request_id,
      null,
      null,
      null,
      v_requester_id,
      null,
      true
    );
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."finalize_request_completion"("p_request_id" "uuid", "p_actor_id" "uuid", "p_status_event_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_request"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_status public.request_status;
  v_requester_id uuid;
begin
  select status, requester_id
    into v_status, v_requester_id
  from public.requests
  where id = p_request_id and selected_user_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'in_progress' then
    return;
  end if;

  if v_status <> 'accepted' then
    raise exception 'only a selected request can be started' using errcode = '55000';
  end if;

  update public.requests
  set status = 'in_progress',
      started_at = now()
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'in_progress'::public.request_status,
    'start:' || p_request_id::text
  );

end;
$$;


ALTER FUNCTION "public"."start_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_service_problem"("p_request_id" "uuid", "p_kind" "public"."service_problem_kind" DEFAULT 'completion_issue'::"public"."service_problem_kind", "p_description" "text" DEFAULT ''::"text", "p_evidence_paths" "text"[] DEFAULT '{}'::"text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_status public.request_status;
  v_payment public.payment_status;
  v_helper_name text;
  v_requester_name text;
  v_description text := coalesce(p_description, '');
  v_evidence text[] := coalesce(p_evidence_paths, '{}');
begin
  perform public.assert_dispute_evidence_paths(v_user_id, v_evidence);

  if public.service_problem_requires_description(p_kind)
     and char_length(btrim(v_description)) < 10 then
    raise exception 'please describe what went wrong (at least 10 characters)' using errcode = '22023';
  end if;

  select r.requester_id, r.selected_user_id, r.status, r.payment_status
    into v_requester_id, v_selected_user_id, v_status, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_requester_id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_user_id not in (v_requester_id, v_selected_user_id) then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'disputed' then
    return;
  end if;

  if p_kind = 'completion_issue' then
    if v_user_id <> v_requester_id then
      raise exception 'request not found' using errcode = 'P0002';
    end if;

    if v_status <> 'completion_pending' then
      raise exception 'a completion problem can only be reported while completion is pending'
        using errcode = '55000';
    end if;
  elsif p_kind in ('provider_no_show', 'provider_unreachable') then
    if v_user_id <> v_requester_id then
      raise exception 'request not found' using errcode = 'P0002';
    end if;

    if v_status not in ('accepted', 'in_progress') then
      raise exception 'this problem can only be reported during an active service'
        using errcode = '55000';
    end if;

    if p_kind = 'provider_unreachable'
       and public.provider_location_recently_updated(v_selected_user_id, p_request_id) then
      raise exception
        'your provider''s location was updated recently; try calling or messaging before reporting them unreachable'
        using errcode = '55000';
    end if;
  elsif p_kind = 'client_no_show' then
    if v_user_id <> v_selected_user_id then
      raise exception 'request not found' using errcode = 'P0002';
    end if;

    if v_status not in ('accepted', 'in_progress') then
      raise exception 'this problem can only be reported during an active service'
        using errcode = '55000';
    end if;
  elsif p_kind = 'service_not_completed' then
    if v_status not in ('accepted', 'in_progress', 'completion_pending') then
      raise exception 'this problem can only be reported during an active service'
        using errcode = '55000';
    end if;
  elsif p_kind = 'service_differs_from_request' then
    if v_status not in ('in_progress', 'completion_pending') then
      raise exception 'this problem can only be reported once work has started'
        using errcode = '55000';
    end if;
  elsif p_kind = 'other' then
    if v_status not in ('accepted', 'in_progress', 'completion_pending') then
      raise exception 'this problem can only be reported during an active service'
        using errcode = '55000';
    end if;
  else
    raise exception 'unsupported problem kind' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.service_problems sp
    where sp.request_id = p_request_id
      and sp.status = 'open'
  ) then
    raise exception 'a problem is already open on this request' using errcode = '55000';
  end if;

  insert into public.service_problems (
    request_id,
    kind,
    reported_by,
    status,
    status_before,
    payment_before,
    respond_by,
    description,
    evidence_paths
  )
  values (
    p_request_id,
    p_kind,
    v_user_id,
    'open',
    v_status,
    v_payment,
    case
      when p_kind in ('provider_no_show', 'client_no_show', 'provider_unreachable')
        then now() + public.service_problem_response_interval()
      else null
    end,
    btrim(v_description),
    v_evidence
  );

  update public.requests
  set status = 'disputed',
      completion_confirm_by = null
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'disputed',
    'report_problem:' || p_kind::text || ':' || p_request_id::text
  );

  if v_payment in ('locked', 'pending') then
    perform public.apply_payment_transition(
      p_request_id,
      'disputed',
      'dispute:' || p_kind::text || ':' || p_request_id::text
    );
  end if;

  if p_kind in ('completion_issue', 'service_not_completed', 'service_differs_from_request', 'other')
     and v_selected_user_id is not null then
    perform public.release_provider(v_selected_user_id);
  end if;

  select p.display_name into v_helper_name
  from public.profiles p
  where p.id = v_selected_user_id;

  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = v_requester_id;

  if p_kind = 'provider_no_show' then
    perform public.create_notification(
      v_selected_user_id,
      'problem:' || p_request_id::text || ':' || p_kind::text || ':provider',
      'problem_reported'::public.notification_type,
      'Could not meet up',
      format('%s reported they could not meet up for this request. Open the request to respond.', coalesce(public.display_first_name(v_requester_name), 'The requester')),
      format('/engagement/%s', p_request_id),
      p_request_id,
      null,
      null,
      null,
      v_requester_id,
      jsonb_build_object('problem_kind', p_kind),
      true
    );
  elsif p_kind = 'provider_unreachable' then
    perform public.create_notification(
      v_selected_user_id,
      'problem:' || p_request_id::text || ':' || p_kind::text || ':provider',
      'problem_reported'::public.notification_type,
      'Trying to reach you',
      format('%s is trying to reach you about this request.', coalesce(public.display_first_name(v_requester_name), 'The requester')),
      format('/engagement/%s', p_request_id),
      p_request_id,
      null,
      null,
      null,
      v_requester_id,
      jsonb_build_object('problem_kind', p_kind),
      true
    );
  elsif p_kind = 'client_no_show' then
    perform public.create_notification(
      v_requester_id,
      'problem:' || p_request_id::text || ':' || p_kind::text || ':client',
      'problem_reported'::public.notification_type,
      'Could not meet up',
      format('%s reported they could not meet up for this request.', coalesce(public.display_first_name(v_helper_name), 'Your helper')),
      format('/engagement/%s', p_request_id),
      p_request_id,
      null,
      null,
      null,
      v_selected_user_id,
      jsonb_build_object('problem_kind', p_kind),
      true
    );
  elsif p_kind in (
    'completion_issue',
    'service_not_completed',
    'service_differs_from_request',
    'other'
  ) then
    perform public.create_notification(
      case when v_user_id = v_requester_id then v_selected_user_id else v_requester_id end,
      'dispute:' || p_request_id::text || ':' || p_kind::text,
      'dispute_opened'::public.notification_type,
      'Problem reported',
      'There is an open problem on this request. Payment stays on hold until it is resolved.',
      format('/engagement/%s', p_request_id),
      p_request_id,
      null,
      null,
      null,
      v_user_id,
      jsonb_build_object('problem_kind', p_kind),
      true
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."report_service_problem"("p_request_id" "uuid", "p_kind" "public"."service_problem_kind", "p_description" "text", "p_evidence_paths" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_resolve_service_problem"("p_problem_id" "uuid", "p_outcome" "text", "p_admin_note" "text", "p_idempotency_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_existing public.dispute_admin_resolutions%rowtype;
  v_problem public.service_problems%rowtype;
  v_status public.request_status;
  v_payment public.payment_status;
  v_selected_user_id uuid;
  v_requester_id uuid;
  v_resolution text;
  v_request_after public.request_status;
  v_payment_after public.payment_status;
  v_push_title text;
  v_push_body text;
  v_push_type public.notification_type;
  v_provider_push_type public.notification_type;
  v_provider_push_body text;
begin
  perform public.assert_admin_caller();

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if p_admin_note is null or btrim(p_admin_note) = '' then
    raise exception 'an admin note is required' using errcode = '22023';
  end if;

  if p_outcome not in ('refund_requester', 'pay_provider', 'resume_service') then
    raise exception 'unsupported admin outcome' using errcode = '22023';
  end if;

  select *
    into v_existing
  from public.dispute_admin_resolutions dar
  where dar.idempotency_key = p_idempotency_key;

  if v_existing.id is not null then
    return;
  end if;

  select sp.*
    into v_problem
  from public.service_problems sp
  where sp.id = p_problem_id
  for update;

  if v_problem.id is null or v_problem.status <> 'open' then
    raise exception 'there is no open dispute on this problem' using errcode = '55000';
  end if;

  select r.status, r.payment_status, r.selected_user_id, r.requester_id
    into v_status, v_payment, v_selected_user_id, v_requester_id
  from public.requests r
  where r.id = v_problem.request_id
  for update;

  if v_status <> 'disputed' then
    raise exception 'request is not disputed' using errcode = '55000';
  end if;

  if p_outcome = 'refund_requester' then
    v_resolution := 'admin_refund_requester';

    update public.request_responses
    set status = case
                   when status = 'accepted' then 'declined'::public.response_status
                   else 'expired'::public.response_status
                 end,
        resolved_at = coalesce(resolved_at, now())
    where request_id = v_problem.request_id
      and status in ('pending', 'accepted');

    update public.requests
    set status = 'cancelled',
        cancelled_at = now(),
        selected_user_id = null,
        accepted_response_id = null,
        completion_confirm_by = null
    where id = v_problem.request_id;

    perform public.record_request_status_event(
      v_problem.request_id,
      v_problem.reported_by,
      v_status,
      'cancelled',
      'admin_dispute:' || p_idempotency_key
    );

    if v_payment in ('locked', 'pending', 'disputed') then
      perform public.apply_payment_transition(
        v_problem.request_id,
        'refunded',
        'admin_dispute_refund:' || p_idempotency_key
      );
    end if;

    if v_selected_user_id is not null then
      perform public.release_provider(v_selected_user_id);
    end if;

    v_request_after := 'cancelled';
    v_payment_after := case
      when v_payment in ('locked', 'pending', 'disputed') then 'refunded'::public.payment_status
      else v_payment
    end;
    v_push_title := 'Dispute update';
    v_push_body := 'Your payment has been returned to your wallet.';
    v_push_type := 'dispute_resolved'::public.notification_type;
    v_provider_push_type := 'dispute_resolved'::public.notification_type;
    v_provider_push_body := v_push_body;
  elsif p_outcome = 'pay_provider' then
    v_resolution := 'admin_pay_provider';

    update public.requests
    set status = 'completed',
        completed_at = now(),
        started_at = coalesce(started_at, now()),
        completion_confirm_by = null
    where id = v_problem.request_id;

    perform public.record_request_status_event(
      v_problem.request_id,
      v_problem.reported_by,
      v_status,
      'completed',
      'admin_dispute:' || p_idempotency_key
    );

    if v_payment in ('locked', 'pending', 'disputed') then
      perform public.apply_payment_transition(
        v_problem.request_id,
        'released',
        'admin_dispute_release:' || p_idempotency_key
      );
    end if;

    update public.profiles
    set jobs_completed = jobs_completed + 1
    where id = v_selected_user_id;

    update public.profiles
    set requests_completed = requests_completed + 1
    where id = v_requester_id;

    if v_selected_user_id is not null then
      perform public.release_provider(v_selected_user_id);
    end if;

    v_request_after := 'completed';
    v_payment_after := case
      when v_payment in ('locked', 'pending', 'disputed') then 'released'::public.payment_status
      else v_payment
    end;
    v_push_title := 'Payment released';
    v_push_body := 'Your payment has been released after the dispute was resolved.';
    v_push_type := 'funds_released_after_resolution'::public.notification_type;
    v_provider_push_type := 'payment_received'::public.notification_type;
    v_provider_push_body := 'Your payment has been released after the dispute was resolved.';
  else
    v_resolution := 'admin_resume_service';

    update public.requests
    set status = v_problem.status_before,
        completion_confirm_by = case
          when v_problem.status_before = 'completion_pending'::public.request_status
            then now() + public.completion_confirmation_interval()
          else null
        end
    where id = v_problem.request_id;

    perform public.record_request_status_event(
      v_problem.request_id,
      v_problem.reported_by,
      v_status,
      v_problem.status_before,
      'admin_dispute:' || p_idempotency_key
    );

    if v_problem.payment_before in ('locked', 'pending')
       and v_payment = 'disputed' then
      perform public.apply_payment_transition(
        v_problem.request_id,
        v_problem.payment_before,
        'admin_dispute_resume:' || p_idempotency_key
      );
      v_payment_after := v_problem.payment_before;
    else
      v_payment_after := v_payment;
    end if;

    v_request_after := v_problem.status_before;
    v_push_title := 'Dispute update';
    v_push_body := 'The dispute was reviewed. You can continue with this request.';
    v_push_type := 'dispute_resolved'::public.notification_type;
    v_provider_push_type := 'dispute_resolved'::public.notification_type;
    v_provider_push_body := v_push_body;
  end if;

  update public.service_problems
  set status = 'resolved',
      resolution = v_resolution,
      resolved_at = now()
  where id = v_problem.id;

  insert into public.dispute_admin_resolutions (
    service_problem_id,
    request_id,
    outcome,
    admin_note,
    idempotency_key,
    request_status_after,
    payment_status_after
  )
  values (
    v_problem.id,
    v_problem.request_id,
    p_outcome,
    btrim(p_admin_note),
    p_idempotency_key,
    v_request_after,
    v_payment_after
  );

  perform public.create_notification(
      v_requester_id,
      'admin_dispute:' || p_idempotency_key || ':requester',
      v_push_type,
    v_push_title,
    v_push_body,
    format('/engagement/%s', v_problem.request_id),
    v_problem.request_id,
    null,
    null,
    null,
    null,
    jsonb_build_object('admin_outcome', p_outcome),
      true
    );

  if v_selected_user_id is not null then
    perform public.create_notification(
      v_selected_user_id,
      'admin_dispute:' || p_idempotency_key || ':provider',
      v_provider_push_type,
      v_push_title,
      v_provider_push_body,
      format('/engagement/%s', v_problem.request_id),
      v_problem.request_id,
      null,
      null,
      null,
      v_requester_id,
      jsonb_build_object('admin_outcome', p_outcome),
      true
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."admin_resolve_service_problem"("p_problem_id" "uuid", "p_outcome" "text", "p_admin_note" "text", "p_idempotency_key" "text") OWNER TO "postgres";
