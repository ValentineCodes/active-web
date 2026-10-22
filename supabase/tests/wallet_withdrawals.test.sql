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

select pg_temp.make_user('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Withdrawal User', '+2348000000401');
select pg_temp.make_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Finance Admin WD', '+2348000000402');
select pg_temp.make_user('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Other User', '+2348000000403');

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
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
    500000,
    'seed-wd-user',
    'test'
  )$$,
  'fund wallet'
);

select public.insert_user_bank_account(
  'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
  '058',
  'GTBank',
  '0123456789',
  'WD TEST USER',
  'RCP_wd_full_test'
) as bank_id \gset

select public.request_wallet_withdrawal(
  'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
  1000,
  :'bank_id'::uuid,
  'wd-idem-1'
) as withdrawal_id \gset

select is(
  (select status::text from public.wallet_withdrawals where id = :'withdrawal_id'::uuid),
  'pending',
  'queue row is pending'
);

select is(
  (select wt.status::text from public.wallet_transactions wt
   join public.wallet_withdrawals w on w.wallet_transaction_id = wt.id
   where w.id = :'withdrawal_id'::uuid),
  'pending',
  'reservation ledger row is pending'
);

select is(
  (select available_balance from public.wallets where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid),
  (500000 - 100000)::bigint,
  'available balance reserved once'
);

select is(
  public.request_wallet_withdrawal(
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
    1000,
    :'bank_id'::uuid,
    'wd-idem-1'
  )::text,
  :'withdrawal_id',
  'duplicate idempotency returns same withdrawal id'
);

select throws_ok(
  $$select public.request_wallet_withdrawal(
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
    4500,
    (
      select a.id
      from public.user_bank_accounts a
      where a.user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid
      limit 1
    ),
    'wd-idem-2'
  )$$,
  '55000',
  null,
  'insufficient balance'
);

select throws_ok(
  $$select public.request_wallet_withdrawal(
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
    50,
    (
      select a.id
      from public.user_bank_accounts a
      where a.user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid
      limit 1
    ),
    'wd-idem-3'
  )$$,
  '22023',
  null,
  'invalid amount below minimum'
);

select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd');

select ok(
  (select count(*)::int from public.list_my_wallet_withdrawals(10, 0)) >= 1,
  'user can list own withdrawals'
);

select ok(
  (public.get_my_wallet_withdrawal(:'withdrawal_id'::uuid)->>'destination_account_number_masked') LIKE '******%',
  'user sees masked account number'
);

select pg_temp.act_as('ffffffff-ffff-ffff-ffff-ffffffffffff');

select throws_ok(
  format($$select public.get_my_wallet_withdrawal(%L::uuid)$$, :'withdrawal_id'),
  'P0002',
  null,
  'other user cannot read withdrawal'
);

select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd');

select throws_ok(
  format(
    $$select public.admin_begin_wallet_withdrawal_processing(
      %L::uuid,
      'user-attempt-1',
      null
    )$$,
    :'withdrawal_id'
  ),
  '42501',
  null,
  'non-admin cannot process withdrawals'
);

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $$select public.admin_provision_member(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid,
    'finance_admin'::public.admin_role
  )$$,
  'provision finance admin'
);

select pg_temp.act_as('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');

select throws_ok(
  format(
    $$select public.admin_complete_wallet_withdrawal(
      %L::uuid,
      'admin-complete-too-early',
      'TRF-001',
      null
    )$$,
    :'withdrawal_id'
  ),
  '55000',
  null,
  'cannot complete while still pending'
);

select lives_ok(
  format(
    $$select public.admin_begin_wallet_withdrawal_processing(
      %L::uuid,
      'admin-process-1',
      'picked up for manual transfer'
    )$$,
    :'withdrawal_id'
  ),
  'admin moves withdrawal to processing'
);

select set_config('role', 'postgres', true);

select is(
  (select available_balance from public.wallets where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid),
  (500000 - 100000)::bigint,
  'approval does not create a second reservation'
);

select pg_temp.act_as('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');

select lives_ok(
  format(
    $$select public.admin_complete_wallet_withdrawal(
      %L::uuid,
      'admin-complete-1',
      'TRF-001',
      'paid via bank app'
    )$$,
    :'withdrawal_id'
  ),
  'admin completes withdrawal'
);

select set_config('role', 'postgres', true);

select is(
  (select w.status::text from public.wallet_withdrawals w where w.idempotency_key = 'wd-idem-1'),
  'completed',
  'withdrawal completed'
);

select is(
  (select wt.status::text from public.wallet_transactions wt
   join public.wallet_withdrawals w on w.wallet_transaction_id = wt.id
   where w.idempotency_key = 'wd-idem-1'),
  'completed',
  'reservation ledger finalized'
);

select is(
  (select available_balance from public.wallets where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid),
  (500000 - 100000)::bigint,
  'available stays debited after completion'
);

select pg_temp.act_as('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');

select throws_ok(
  format(
    $$select public.admin_complete_wallet_withdrawal(
      %L::uuid,
      'admin-complete-dup',
      'TRF-002',
      null
    )$$,
    :'withdrawal_id'
  ),
  '55000',
  null,
  'double finalization blocked'
);

select set_config('role', 'service_role', true);

select public.request_wallet_withdrawal(
  'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
  2000,
  :'bank_id'::uuid,
  'wd-idem-reject'
) as withdrawal_reject_id \gset

select lives_ok(
  format(
    $$select public.admin_reject_wallet_withdrawal(
      %L::uuid,
      'admin-reject-1',
      'We could not verify this payout request.',
      'internal note'
    )$$,
    :'withdrawal_reject_id'
  ),
  'admin rejects pending withdrawal'
);

select set_config('role', 'postgres', true);

select is(
  (select w.status::text from public.wallet_withdrawals w where w.idempotency_key = 'wd-idem-reject'),
  'rejected',
  'rejected status'
);

select is(
  (select available_balance from public.wallets where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid),
  (500000 - 100000)::bigint,
  'funds released after reject restores available while completed withdrawal stays debited'
);

select isnt(
  (select w.release_transaction_id from public.wallet_withdrawals w where w.idempotency_key = 'wd-idem-reject'),
  NULL,
  'release ledger linked'
);

select w.id as reject_wd_id
from public.wallet_withdrawals w
where w.idempotency_key = 'wd-idem-reject' \gset

select pg_temp.act_as('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');

select is(
  public.admin_reject_wallet_withdrawal(
    :'reject_wd_id'::uuid,
    'admin-reject-1',
    'We could not verify this payout request.',
    null
  )::text,
  :'reject_wd_id',
  'duplicate reject idempotency is safe'
);

select set_config('role', 'service_role', true);

select public.request_wallet_withdrawal(
  'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
  1500,
  :'bank_id'::uuid,
  'wd-idem-fail'
) as withdrawal_fail_id \gset

select lives_ok(
  format(
    $$select public.admin_begin_wallet_withdrawal_processing(
      %L::uuid,
      'admin-process-fail',
      null
    )$$,
    :'withdrawal_fail_id'
  ),
  'move to processing for fail test'
);

select lives_ok(
  format(
    $$select public.admin_fail_wallet_withdrawal(
      %L::uuid,
      'admin-fail-1',
      'The bank transfer could not be completed.',
      null
    )$$,
    :'withdrawal_fail_id'
  ),
  'admin fails processing withdrawal'
);

select set_config('role', 'postgres', true);

select is(
  (select available_balance from public.wallets where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid),
  (500000 - 100000)::bigint,
  'funds released after fail while completed withdrawal stays debited'
);

select ok(
  exists (
    select 1
    from public.admin_audit_events a
    inner join public.wallet_withdrawals w on w.id = a.entity_id
    where a.entity_type = 'wallet_withdrawal'::public.admin_audit_entity_type
      and w.idempotency_key = 'wd-idem-1'
      and a.action = 'wallet_withdrawal_complete'
  ),
  'audit row recorded for completion'
);

select finish();

rollback;
