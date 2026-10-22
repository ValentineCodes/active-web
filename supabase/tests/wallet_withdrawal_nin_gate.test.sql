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

select pg_temp.make_user('44444444-4444-4444-4444-444444444401', 'Nin Gate User', '+2348000000901');

select set_config('role', 'postgres', true);

update public.platform_runtime_config
set deployment_environment = 'production'
where id = 1;

update public.withdrawal_policy
set
  require_identity_verification_for_withdrawal = true,
  allow_withdraw_without_identity_in_development = false
where id = 1;

select set_config('role', 'service_role', true);

select lives_ok(
  $$select public.wallet_record_deposit(
    '44444444-4444-4444-4444-444444444401'::uuid,
    500000,
    'seed-nin-gate',
    'test'
  )$$,
  'fund wallet for nin gate test'
);

select public.insert_user_bank_account(
  '44444444-4444-4444-4444-444444444401'::uuid,
  '058',
  'GTBank',
  '0123456799',
  'NIN GATE TEST',
  'RCP_nin_gate'
) as bank_id \gset

select throws_ok(
  $$select public.request_wallet_withdrawal(
    '44444444-4444-4444-4444-444444444401'::uuid,
    1000,
    (
      select a.id
      from public.user_bank_accounts a
      where a.user_id = '44444444-4444-4444-4444-444444444401'::uuid
      limit 1
    ),
    'nin-gate-no-nin'
  )$$,
  '42501',
  null,
  'request_wallet_withdrawal blocked without nin when identity is required'
);

select public.submit_user_nin_encrypted(
  '44444444-4444-4444-4444-444444444401'::uuid,
  decode('cafe', 'hex'),
  decode('0102030405060708090a0b0c', 'hex'),
  'v1',
  repeat('d', 64),
  '1234'
) as nin_submit \gset

select is(
  (
    select public.request_wallet_withdrawal(
      '44444444-4444-4444-4444-444444444401'::uuid,
      1000,
      (
        select a.id
        from public.user_bank_accounts a
        where a.user_id = '44444444-4444-4444-4444-444444444401'::uuid
        limit 1
      ),
      'nin-gate-with-nin'
    ) is not null
  ),
  true,
  'request_wallet_withdrawal succeeds after nin submission'
);

select is(
  (
    select w.status::text
    from public.wallet_withdrawals w
    where w.idempotency_key = 'nin-gate-with-nin'
  ),
  'pending',
  'withdrawal reserves funds only after accepted request'
);

select * from finish();
rollback;
