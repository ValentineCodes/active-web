-- Temporary stand-in until a payment-provider wallet service is integrated.
-- Adjusts available balance only; escrow buckets are unchanged.

create or replace function public.wallet_top_up(
  p_amount numeric,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
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

  perform public.post_wallet_ledger(
    'manual_top_up:' || p_idempotency_key,
    v_user_id,
    null,
    'manual_top_up',
    p_amount,
    0,
    0
  );
end;
$$;

create or replace function public.wallet_withdraw(
  p_amount numeric,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_available numeric;
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

  select wa.available into v_available
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

revoke all on function public.wallet_top_up(numeric, text) from public, anon;
revoke all on function public.wallet_withdraw(numeric, text) from public, anon;
grant execute on function public.wallet_top_up(numeric, text) to authenticated;
grant execute on function public.wallet_withdraw(numeric, text) to authenticated;
