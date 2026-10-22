-- Additional financial and security checks for the manual withdrawal queue.

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

select pg_temp.make_user('33333333-3333-3333-3333-333333333301', 'Audit User A', '+2348000000801');
select pg_temp.make_user('33333333-3333-3333-3333-333333333302', 'Audit User B', '+2348000000802');
select pg_temp.make_user('33333333-3333-3333-3333-333333333303', 'Audit Finance', '+2348000000803');

select set_config('role', 'postgres', true);

update public.platform_runtime_config set deployment_environment = 'local' where id = 1;
update public.withdrawal_policy
set allow_withdraw_without_identity_in_development = true,
    require_identity_verification_for_withdrawal = true
where id = 1;

select set_config('role', 'service_role', true);

select lives_ok(
  $$select public.wallet_record_deposit(
    '33333333-3333-3333-3333-333333333301'::uuid,
    800000,
    'audit-a-fund',
    'test'
  )$$,
  'fund user A'
);

select public.insert_user_bank_account(
  '33333333-3333-3333-3333-333333333301'::uuid,
  '058',
  'GTBank',
  '0123456701',
  'AUDIT USER A',
  'RCP_audit_a'
) as bank_a \gset

select public.insert_user_bank_account(
  '33333333-3333-3333-3333-333333333302'::uuid,
  '058',
  'GTBank',
  '0123456702',
  'AUDIT USER B',
  'RCP_audit_b'
) as bank_b \gset

select throws_ok(
  $$select public.request_wallet_withdrawal(
    '33333333-3333-3333-3333-333333333302'::uuid,
    1000,
    :'bank_a'::uuid,
    'audit-cross-user'
  )$$,
  '22023',
  null,
  'cannot withdraw using another user bank account'
);

select public.wallet_apply_entry(
  'audit-lock-sim',
  '33333333-3333-3333-3333-333333333301'::uuid,
  NULL,
  'adjustment'::public.wallet_transaction_type,
  -600000,
  600000,
  'Simulate engagement lock',
  '{}'::jsonb,
  NULL,
  0,
  'completed'::public.wallet_transaction_status
);

select is(
  (select available_balance from public.wallets where user_id = '33333333-3333-3333-3333-333333333301'::uuid),
  200000::bigint,
  'only available balance is withdrawable'
);

select throws_ok(
  $$select public.request_wallet_withdrawal(
    '33333333-3333-3333-3333-333333333301'::uuid,
    3000,
    :'bank_a'::uuid,
    'audit-over-available'
  )$$,
  '55000',
  null,
  'cannot withdraw more than available (locked funds excluded)'
);

select public.request_wallet_withdrawal(
  '33333333-3333-3333-3333-333333333301'::uuid,
  1000,
  :'bank_a'::uuid,
  'audit-reserve-1'
) as withdrawal_audit_id \gset

select is(
  (select available_balance from public.wallets where user_id = '33333333-3333-3333-3333-333333333301'::uuid),
  100000::bigint,
  'pending withdrawal reserves available immediately'
);

select set_config('role', 'postgres', true);

select lives_ok(
  $$select public.admin_provision_member(
    '33333333-3333-3333-3333-333333333303'::uuid,
    'finance_admin'::public.admin_role
  )$$,
  'finance admin'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333303');

select lives_ok(
  format(
    $$select public.admin_begin_wallet_withdrawal_processing(
      %L::uuid,
      'audit-begin-1',
      null
    )$$,
    :'withdrawal_audit_id'
  ),
  'approve for processing'
);

select is(
  (select available_balance from public.wallets where user_id = '33333333-3333-3333-3333-333333333301'::uuid),
  100000::bigint,
  'processing approval does not reserve funds again'
);

select is(
  (select count(*)::int from public.wallet_transactions wt
   where wt.user_id = '33333333-3333-3333-3333-333333333301'::uuid
     and wt.type = 'withdrawal'::public.wallet_transaction_type),
  1,
  'single withdrawal ledger row'
);

select lives_ok(
  format(
    $$select public.admin_fail_wallet_withdrawal(
      %L::uuid,
      'audit-fail-1',
      'Transfer could not be confirmed.',
      null
    )$$,
    :'withdrawal_audit_id'
  ),
  'fail after processing'
);

select is(
  (select count(*)::int from public.wallet_transactions wt
   where wt.user_id = '33333333-3333-3333-3333-333333333301'::uuid
     and wt.type = 'adjustment'::public.wallet_transaction_type
     and wt.metadata ->> 'legacy_kind' = 'withdrawal_release'),
  1,
  'failure releases funds exactly once'
);

select is(
  public.admin_fail_wallet_withdrawal(
    :'withdrawal_audit_id'::uuid,
    'audit-fail-1',
    'Transfer could not be confirmed.',
    null
  )::text,
  :'withdrawal_audit_id',
  'idempotent fail does not double-release'
);

select is(
  (select available_balance from public.wallets where user_id = '33333333-3333-3333-3333-333333333301'::uuid),
  200000::bigint,
  'available restored after fail'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333301');

select throws_ok(
  format($$select public.admin_begin_wallet_withdrawal_processing(%L::uuid, 'x', null)$$, :'withdrawal_audit_id'),
  '42501',
  null,
  'ordinary user cannot admin-process withdrawals'
);

select finish();

rollback;
