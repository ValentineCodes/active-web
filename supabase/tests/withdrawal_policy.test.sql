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

select pg_temp.make_user('22222222-2222-2222-2222-222222222201', 'Policy User', '+2348000000701');
select pg_temp.make_user('22222222-2222-2222-2222-222222222202', 'Policy Admin', '+2348000000702');

create function pg_temp.act_as(p_id uuid)
returns text
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
  return p_id::text;
end;
$$;

select set_config('role', 'postgres', true);

update public.platform_runtime_config
set deployment_environment = 'production'
where id = 1;

update public.withdrawal_policy
set
  min_amount_kobo = 10000,
  max_amount_kobo = 100000000,
  max_daily_amount_kobo = 200000000,
  withdrawals_enabled = true,
  require_admin_review = true,
  require_identity_verification_for_withdrawal = true,
  allow_withdraw_without_identity_in_development = true
where id = 1;

select set_config('role', 'service_role', true);

select lives_ok(
  $$select public.wallet_record_deposit(
    '22222222-2222-2222-2222-222222222201'::uuid,
    500000,
    'policy-seed',
    'test'
  )$$,
  'fund user'
);

select public.insert_user_bank_account(
  '22222222-2222-2222-2222-222222222201'::uuid,
  '058',
  'GTBank',
  '0111222333',
  'POLICY USER',
  'RCP_policy'
) as bank_id \gset

select throws_ok(
  $$select public.request_wallet_withdrawal(
    '22222222-2222-2222-2222-222222222201'::uuid,
    1000,
    :'bank_id'::uuid,
    'policy-prod-identity-block'
  )$$,
  '42501',
  null,
  'production blocks withdrawal without provider identity even when dev bypass flag is true'
);

select set_config('role', 'postgres', true);

update public.platform_runtime_config
set deployment_environment = 'local'
where id = 1;

select set_config('role', 'service_role', true);

select throws_ok(
  $$select public.request_wallet_withdrawal(
    '22222222-2222-2222-2222-222222222201'::uuid,
    50,
    :'bank_id'::uuid,
    'policy-below-min'
  )$$,
  '22023',
  null,
  'enforces configured minimum kobo'
);

select set_config('role', 'postgres', true);

update public.withdrawal_policy
set withdrawals_enabled = false
where id = 1;

select set_config('role', 'service_role', true);

select throws_ok(
  $$select public.request_wallet_withdrawal(
    '22222222-2222-2222-2222-222222222201'::uuid,
    1000,
    :'bank_id'::uuid,
    'policy-disabled'
  )$$,
  '55000',
  null,
  'blocks when withdrawals disabled'
);

select set_config('role', 'postgres', true);

update public.withdrawal_policy
set
  withdrawals_enabled = true,
  max_daily_amount_kobo = 150000
where id = 1;

select set_config('role', 'service_role', true);

select public.request_wallet_withdrawal(
  '22222222-2222-2222-2222-222222222201'::uuid,
  1000,
  :'bank_id'::uuid,
  'policy-daily-1'
);

select throws_ok(
  $$select public.request_wallet_withdrawal(
    '22222222-2222-2222-2222-222222222201'::uuid,
    1000,
    :'bank_id'::uuid,
    'policy-daily-2'
  )$$,
  '55000',
  null,
  'daily limit includes pending reserved withdrawals'
);

select public.request_wallet_withdrawal(
  '22222222-2222-2222-2222-222222222201'::uuid,
  500,
  :'bank_id'::uuid,
  'policy-local-bypass'
) as withdrawal_local_id \gset

select isnt(
  :'withdrawal_local_id',
  null,
  'local deployment allows withdrawal with development bypass'
);

select set_config('role', 'postgres', true);

select lives_ok(
  $$select public.admin_provision_member(
    '22222222-2222-2222-2222-222222222202'::uuid,
    'finance_admin'::public.admin_role
  )$$,
  'finance admin'
);

update public.platform_runtime_config
set deployment_environment = 'production'
where id = 1;

select pg_temp.act_as('22222222-2222-2222-2222-222222222202');

select throws_ok(
  $$select public.admin_update_withdrawal_policy(
    10000,
    100000000,
    500000000,
    true,
    true,
    true,
    true,
    'policy-admin-bypass-prod'
  )$$,
  '55000',
  null,
  'cannot enable identity dev bypass while deployment is production'
);

select finish();

rollback;
