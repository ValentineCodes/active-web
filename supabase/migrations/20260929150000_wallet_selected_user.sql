-- Wallet sync still referenced requests.provider_id after the column rename.

create or replace function public.sync_wallet_payment_transition(
  p_request_id uuid,
  p_from public.payment_status,
  p_to public.payment_status,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escrow public.request_escrow%rowtype;
  v_selected_user_id uuid;
begin
  if not exists (select 1 from public.request_escrow re where re.request_id = p_request_id) then
    return;
  end if;

  select * into v_escrow
  from public.request_escrow re
  where re.request_id = p_request_id;

  select r.selected_user_id into v_selected_user_id
  from public.requests r
  where r.id = p_request_id;

  if p_from = 'locked' and p_to = 'pending' then
    perform public.post_wallet_ledger(
      p_idempotency_key || ':escrow_pending',
      v_escrow.requester_id,
      p_request_id,
      'escrow_pending',
      0,
      -v_escrow.total,
      v_escrow.total
    );

    update public.request_escrow
    set escrow_bucket = 'pending'
    where request_id = p_request_id;
  elsif p_from = 'pending' and p_to = 'released' then
    if v_selected_user_id is null then
      raise exception 'cannot release escrow without a selected user' using errcode = '55000';
    end if;

    perform public.post_wallet_ledger(
      p_idempotency_key || ':escrow_release',
      v_escrow.requester_id,
      p_request_id,
      'escrow_release',
      0,
      0,
      -v_escrow.total
    );

    perform public.post_wallet_ledger(
      p_idempotency_key || ':pay_provider',
      v_selected_user_id,
      p_request_id,
      'pay_provider',
      v_escrow.provider_amount,
      0,
      0
    );

    perform public.post_wallet_ledger(
      p_idempotency_key || ':service_fee',
      null,
      p_request_id,
      'service_fee',
      0,
      0,
      0,
      v_escrow.service_fee
    );
  elsif p_from = 'locked' and p_to = 'refunded' then
    perform public.post_wallet_ledger(
      p_idempotency_key || ':refund',
      v_escrow.requester_id,
      p_request_id,
      'refund',
      v_escrow.total,
      -v_escrow.total,
      0
    );
  elsif p_from = 'pending' and p_to = 'refunded' then
    perform public.post_wallet_ledger(
      p_idempotency_key || ':refund',
      v_escrow.requester_id,
      p_request_id,
      'refund',
      v_escrow.total,
      0,
      -v_escrow.total
    );
  elsif p_from = 'disputed' and p_to = 'released' then
    if v_selected_user_id is null then
      raise exception 'cannot release escrow without a selected user' using errcode = '55000';
    end if;

    if v_escrow.escrow_bucket = 'pending' then
      perform public.post_wallet_ledger(
        p_idempotency_key || ':escrow_release',
        v_escrow.requester_id,
        p_request_id,
        'escrow_release',
        0,
        0,
        -v_escrow.total
      );
    else
      perform public.post_wallet_ledger(
        p_idempotency_key || ':escrow_release',
        v_escrow.requester_id,
        p_request_id,
        'escrow_release',
        0,
        -v_escrow.total,
        0
      );
    end if;

    perform public.post_wallet_ledger(
      p_idempotency_key || ':pay_provider',
      v_selected_user_id,
      p_request_id,
      'pay_provider',
      v_escrow.provider_amount,
      0,
      0
    );

    perform public.post_wallet_ledger(
      p_idempotency_key || ':service_fee',
      null,
      p_request_id,
      'service_fee',
      0,
      0,
      0,
      v_escrow.service_fee
    );
  elsif p_from = 'disputed' and p_to = 'refunded' then
    if v_escrow.escrow_bucket = 'pending' then
      perform public.post_wallet_ledger(
        p_idempotency_key || ':refund',
        v_escrow.requester_id,
        p_request_id,
        'refund',
        v_escrow.total,
        0,
        -v_escrow.total
      );
    else
      perform public.post_wallet_ledger(
        p_idempotency_key || ':refund',
        v_escrow.requester_id,
        p_request_id,
        'refund',
        v_escrow.total,
        -v_escrow.total,
        0
      );
    end if;
  elsif p_from = 'disputed' and p_to = 'pending' then
    if v_escrow.escrow_bucket = 'locked' then
      perform public.post_wallet_ledger(
        p_idempotency_key || ':escrow_pending',
        v_escrow.requester_id,
        p_request_id,
        'escrow_pending',
        0,
        -v_escrow.total,
        v_escrow.total
      );

      update public.request_escrow
      set escrow_bucket = 'pending'
      where request_id = p_request_id;
    end if;
  elsif p_from = 'disputed' and p_to = 'locked' then
    if v_escrow.escrow_bucket = 'pending' then
      perform public.post_wallet_ledger(
        p_idempotency_key || ':escrow_relock',
        v_escrow.requester_id,
        p_request_id,
        'escrow_relock',
        0,
        v_escrow.total,
        -v_escrow.total
      );

      update public.request_escrow
      set escrow_bucket = 'locked'
      where request_id = p_request_id;
    end if;
  end if;
end;
$$;
