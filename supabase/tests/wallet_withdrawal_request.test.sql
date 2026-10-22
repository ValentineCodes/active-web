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
  update public.profiles set display_name = p_name where id = p_id;
  return p_name;
end;
$$;

select pg_temp.make_user('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Withdrawer', '+2348000000301');

select set_config('role', 'postgres', true);

update public.platform_runtime_config
set deployment_environment = 'local'
where id = 1;

update public.withdrawal_policy
set
  allow_withdraw_without_identity_in_development = true,
  require_identity_verification_for_withdrawal = true
where id = 1;

select set_config('role', 'service_role', true);

select lives_ok(
  $$select public.wallet_record_deposit(
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    500000,
    'seed-withdraw-user',
    'test'
  )$$,
  'fund wallet for withdrawal test'
);

select public.insert_user_bank_account(
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  '058',
  'GTBank',
  '0123456789',
  'WITHDRAW TEST',
  'RCP_wd_test'
) as bank_id \gset

select public.request_wallet_withdrawal(
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  1000,
  :'bank_id'::uuid,
  'idem-1'
) as withdrawal_id \gset

select is(
  (select status::text from public.wallet_withdrawals where id = :'withdrawal_id'::uuid),
  'pending',
  'withdrawal queue row is pending'
);

select is(
  (select status::text
   from public.wallet_transactions wt
   join public.wallet_withdrawals w on w.wallet_transaction_id = wt.id
   where w.id = :'withdrawal_id'::uuid),
  'pending',
  'withdrawal ledger row is pending'
);

select is(
  public.request_wallet_withdrawal(
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    1000,
    :'bank_id'::uuid,
    'idem-1'
  )::text,
  :'withdrawal_id',
  'idempotent withdrawal request returns same withdrawal id'
);

select throws_ok(
  $$select public.request_wallet_withdrawal(
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    999999999,
    :'bank_id'::uuid,
    'idem-2'
  )$$,
  '55000',
  null,
  'rejects amount above available balance'
);

select finish();

rollback;
