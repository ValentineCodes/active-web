-- Wire canonical notification types to business events (gaps and corrections).

DROP TRIGGER IF EXISTS "payment_transitions_notify" ON "public"."payment_transitions";

CREATE TRIGGER "payment_transitions_notify"
  AFTER INSERT ON "public"."payment_transitions"
  FOR EACH ROW
  WHEN (
    "new"."to_status" = ANY (
      ARRAY[
        'locked'::"public"."payment_status",
        'refunded'::"public"."payment_status",
        'released'::"public"."payment_status"
      ]
    )
  )
  EXECUTE FUNCTION "public"."notify_payment_transition"();

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
  elsif new.to_status = 'released'::public.payment_status
        and new.idempotency_key not like 'admin_dispute_release:%' then
    perform public.create_notification(
      v_requester_id,
      'payment_transition:' || new.id::text,
      'payment_released'::public.notification_type,
      'Payment released',
      coalesce(
        format('Your %s %s payment for this request has been released.', v_total, v_currency),
        'Your payment for this request has been released.'
      ),
      format('/engagement/%s', new.request_id),
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
  elsif v_pending_count = 2 then
    v_type := 'new_responses'::public.notification_type;
    v_title := 'Another response';
    v_body := 'You now have two responses to review.';
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

CREATE OR REPLACE FUNCTION "public"."finalize_request_completion"(
  "p_request_id" "uuid",
  "p_actor_id" "uuid",
  "p_status_event_key" "text"
) RETURNS boolean
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
  v_rate_body text;
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
      'confirm_complete:' || p_request_id::text || ':payment_received',
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

  v_rate_body := case
    when p_status_event_key like 'auto_complete:%' then
      'The confirmation window ended, so this request was marked complete. You can still leave a rating.'
    else
      'This request is complete. Share how it went.'
  end;

  perform public.create_notification(
    v_requester_id,
    'request:' || p_request_id::text || ':rate_experience',
    'rate_experience'::public.notification_type,
    'Leave a rating',
    v_rate_body,
    format('/rate/%s', p_request_id),
    p_request_id,
    null,
    null,
    null,
    null,
    jsonb_build_object('completion_event_key', p_status_event_key),
    true
  );

  return true;
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

  if v_selected_user_id is null then
    return true;
  end if;

  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = v_requester_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'The requester');

  perform public.create_notification(
    v_selected_user_id,
    'request:' || p_request_id::text || ':auto_complete:payment_received',
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

  return true;
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
    false
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

COMMENT ON FUNCTION "public"."wallet_withdraw"("p_amount" numeric, "p_idempotency_key" "text") IS
  'Synchronous manual withdraw. Failed attempts roll back and do not emit withdrawal_failed notifications.';

-- new_message and missed_call: no messaging/voice product tables yet; wire create_notification when those events exist server-side.
