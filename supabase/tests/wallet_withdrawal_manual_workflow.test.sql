-- Manual withdrawal workflow: state transitions, idempotency, and conflicting admin actions.

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

select pg_temp.make_user('66666666-6666-6666-6666-666666666601', 'Workflow User', '+2348000000601');
select pg_temp.make_user('66666666-6666-6666-6666-666666666602', 'Workflow Finance', '+2348000000602');

select set_config('role', 'postgres', true);

update public.platform_runtime_config
set deployment_environment = 'local'
where id = 1;

update public.withdrawal_policy
set
  require_admin_review = true,
  allow_withdraw_without_identity_in_development = true,
  require_identity_verification_for_withdrawal = true
where id = 1;

select set_config('role', 'service_role', true);

select lives_ok(
  $$select public.wallet_record_deposit(
    '66666666-6666-6666-6666-666666666601'::uuid,
    300000,
    'seed-workflow',
    'test'
  )$$,
  'fund user wallet'
);

select public.insert_user_bank_account(
  '66666666-6666-6666-6666-666666666601'::uuid,
  '058',
  'GTBank',
  '0123456701',
  'WORKFLOW USER',
  'RCP_workflow'
) as bank_id \gset

select public.request_wallet_withdrawal(
  '66666666-6666-6666-6666-666666666601'::uuid,
  500,
  :'bank_id'::uuid,
  'workflow-main'
) as withdrawal_id \gset

select lives_ok(
  $$select public.admin_provision_member(
    '66666666-6666-6666-6666-666666666602'::uuid,
    'finance_admin'::public.admin_role
  )$$,
  'provision finance admin'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666602');

select is(
  public.admin_begin_wallet_withdrawal_processing(
    :'withdrawal_id'::uuid,
    'workflow-begin-1',
    null
  )::text,
  :'withdrawal_id',
  'approve moves pending to processing'
);

select is(
  public.admin_begin_wallet_withdrawal_processing(
    :'withdrawal_id'::uuid,
    'workflow-begin-1',
    null
  )::text,
  :'withdrawal_id',
  'duplicate approve idempotency is safe while processing'
);

select throws_ok(
  format(
    $$select public.admin_reject_wallet_withdrawal(
      %L::uuid,
      'workflow-reject-conflict',
      'Should not reject while processing.',
      null
    )$$,
    :'withdrawal_id'
  ),
  '55000',
  null,
  'cannot reject once processing has started'
);

select lives_ok(
  format(
    $$select public.admin_complete_wallet_withdrawal(
      %L::uuid,
      'workflow-complete-1',
      'TRF-OK',
      null
    )$$,
    :'withdrawal_id'
  ),
  'complete after external transfer confirmed'
);

select throws_ok(
  format(
    $$select public.admin_complete_wallet_withdrawal(
      %L::uuid,
      'workflow-complete-dup',
      'TRF-DUP',
      null
    )$$,
    :'withdrawal_id'
  ),
  '55000',
  null,
  'duplicate finalization blocked after completion'
);

select set_config('role', 'postgres', true);

select is(
  (
    select count(*)::int
    from public.wallet_transactions wt
    where wt.user_id = '66666666-6666-6666-6666-666666666601'::uuid
      and wt.type = 'withdrawal'::public.wallet_transaction_type
  ),
  1,
  'completion does not create a second withdrawal ledger row'
);

select throws_ok(
  format(
    $$select public.admin_fail_wallet_withdrawal(
      %L::uuid,
      'workflow-fail-late',
      'Too late to fail.',
      null
    )$$,
    :'withdrawal_id'
  ),
  '55000',
  null,
  'cannot fail after completion'
);

select public.request_wallet_withdrawal(
  '66666666-6666-6666-6666-666666666601'::uuid,
  400,
  :'bank_id'::uuid,
  'workflow-release'
) as release_wd \gset

select lives_ok(
  format(
    $$select public.admin_reject_wallet_withdrawal(
      %L::uuid,
      'workflow-reject-release',
      'Payout could not be verified.',
      null
    )$$,
    :'release_wd'
  ),
  'reject pending releases reservation once'
);

select is(
  (
    select count(*)::int
    from public.wallet_transactions wt
    where wt.user_id = '66666666-6666-6666-6666-666666666601'::uuid
      and wt.type = 'adjustment'::public.wallet_transaction_type
      and wt.metadata->>'legacy_kind' = 'withdrawal_release'
  ),
  1,
  'exactly one release ledger entry for reject'
);

select set_config('role', 'postgres', true);

select is(
  (
    select w.release_transaction_id is not null
    from public.wallet_withdrawals w
    where w.idempotency_key = 'workflow-release'
  ),
  true,
  'withdrawal links release transaction'
);

select * from finish();
rollback;
