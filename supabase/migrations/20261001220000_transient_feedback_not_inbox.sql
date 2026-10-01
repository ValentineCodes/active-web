-- Stop persisting immediate actor feedback; the app shows toasts for these instead.

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

  if new.to_status = 'refunded'::public.payment_status then
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

  perform public.post_wallet_ledger(
    'manual_withdraw:' || p_idempotency_key,
    v_user_id,
    null,
    'manual_withdraw',
    -p_amount,
    0,
    0
  );
end;
$$;

COMMENT ON FUNCTION "public"."notify_payment_transition"() IS
  'Inbox for refunds/releases to the requester. Funds locked on post is confirmed in-app via toast only.';
