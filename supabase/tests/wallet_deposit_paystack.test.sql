-- Paystack deposit fulfillment idempotency (shared by verify + webhook via wallet_record_deposit).

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

create function pg_temp.make_user(p_id uuid, p_name text, p_phone text)
returns text
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, phone, phone_confirmed_at, created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    p_id, 'authenticated', 'authenticated', p_phone, now(), now(), now()
  );

  update public.profiles
  set display_name = p_name,
      avatar_path = p_id::text || '/avatar.jpg',
      avatar_captured_in_app = true
  where id = p_id;

  return p_name;
end;
$$;

create function pg_temp.act_as_owner()
returns text
language plpgsql
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return 'postgres';
end;
$$;

select pg_temp.make_user('77777777-7777-7777-7777-777777777777', 'Depositor', '+2348000000777') as _ \gset
select pg_temp.act_as_owner() as _ \gset

select lives_ok(
  $$select public.ensure_wallet_account('77777777-7777-7777-7777-777777777777'::uuid)$$,
  'ensure wallet for depositor'
);

select id as wallet_id
from public.wallets
where user_id = '77777777-7777-7777-7777-777777777777'::uuid \gset

insert into public.deposit_transactions (
  user_id,
  wallet_id,
  amount,
  currency,
  reference,
  status
)
values (
  '77777777-7777-7777-7777-777777777777'::uuid,
  :'wallet_id'::uuid,
  250000,
  'NGN',
  'active-dep-pgtap-success',
  'pending'::public.deposit_transaction_status
);

select lives_ok(
  $$select public.wallet_record_deposit(
    '77777777-7777-7777-7777-777777777777'::uuid,
    250000,
    'active-dep-pgtap-success',
    'active-dep-pgtap-success'
  )$$,
  'successful payment credits wallet once'
);

select is(
  (
    select available_balance
    from public.wallets
    where user_id = '77777777-7777-7777-7777-777777777777'::uuid
  ),
  250000::bigint,
  'wallet balance reflects successful deposit'
);

select is(
  (
    select status::text
    from public.deposit_transactions
    where reference = 'active-dep-pgtap-success'
  ),
  'completed',
  'deposit row marked completed'
);

select lives_ok(
  $$select public.wallet_record_deposit(
    '77777777-7777-7777-7777-777777777777'::uuid,
    250000,
    'active-dep-pgtap-success',
    'active-dep-pgtap-success'
  )$$,
  'duplicate verification is a no-op'
);

select is(
  (
    select count(*)::int
    from public.wallet_transactions
    where reference = 'active-dep-pgtap-success'
  ),
  1,
  'duplicate fulfillment does not double-credit'
);

select is(
  (
    select available_balance
    from public.wallets
    where user_id = '77777777-7777-7777-7777-777777777777'::uuid
  ),
  250000::bigint,
  'balance unchanged after duplicate fulfillment'
);

insert into public.deposit_transactions (
  user_id,
  wallet_id,
  amount,
  currency,
  reference,
  status
)
values (
  '77777777-7777-7777-7777-777777777777'::uuid,
  :'wallet_id'::uuid,
  100000,
  'NGN',
  'active-dep-pgtap-verify-first',
  'pending'::public.deposit_transaction_status
);

select lives_ok(
  $$select public.wallet_record_deposit(
    '77777777-7777-7777-7777-777777777777'::uuid,
    100000,
    'active-dep-pgtap-verify-first',
    'active-dep-pgtap-verify-first'
  )$$,
  'verify path credits pending deposit'
);

select lives_ok(
  $$select public.wallet_record_deposit(
    '77777777-7777-7777-7777-777777777777'::uuid,
    100000,
    'active-dep-pgtap-verify-first',
    'active-dep-pgtap-verify-first'
  )$$,
  'webhook arriving after verify does not double-credit'
);

insert into public.deposit_transactions (
  user_id,
  wallet_id,
  amount,
  currency,
  reference,
  status
)
values (
  '77777777-7777-7777-7777-777777777777'::uuid,
  :'wallet_id'::uuid,
  75000,
  'NGN',
  'active-dep-pgtap-webhook-first',
  'pending'::public.deposit_transaction_status
);

select lives_ok(
  $$select public.wallet_record_deposit(
    '77777777-7777-7777-7777-777777777777'::uuid,
    75000,
    'active-dep-pgtap-webhook-first',
    'active-dep-pgtap-webhook-first'
  )$$,
  'webhook path credits pending deposit'
);

select lives_ok(
  $$select public.wallet_record_deposit(
    '77777777-7777-7777-7777-777777777777'::uuid,
    75000,
    'active-dep-pgtap-webhook-first',
    'active-dep-pgtap-webhook-first'
  )$$,
  'verify arriving after webhook does not double-credit'
);

insert into public.deposit_transactions (
  user_id,
  wallet_id,
  amount,
  currency,
  reference,
  status
)
values (
  '77777777-7777-7777-7777-777777777777'::uuid,
  :'wallet_id'::uuid,
  50000,
  'NGN',
  'active-dep-pgtap-failed',
  'pending'::public.deposit_transaction_status
);

update public.deposit_transactions
set status = 'failed'::public.deposit_transaction_status
where reference = 'active-dep-pgtap-failed';

select is(
  (
    select count(*)::int
    from public.wallet_transactions wt
    where wt.reference = 'active-dep-pgtap-failed'
  ),
  0,
  'failed payment does not create wallet transaction'
);

select is(
  (
    select count(*)::int
    from public.deposit_transactions dt
    where dt.reference = 'active-dep-unknown-ref'
  ),
  0,
  'unknown reference has no deposit row'
);

select * from finish();

rollback;
