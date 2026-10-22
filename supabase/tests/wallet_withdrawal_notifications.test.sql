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

select pg_temp.make_user('11111111-1111-1111-1111-111111111101', 'Notify WD User', '+2348000000601');
select pg_temp.make_user('11111111-1111-1111-1111-111111111102', 'Notify Finance', '+2348000000602');

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
    '11111111-1111-1111-1111-111111111101'::uuid,
    300000,
    'seed-notify-wd',
    'test'
  )$$,
  'fund wallet'
);

select public.insert_user_bank_account(
  '11111111-1111-1111-1111-111111111101'::uuid,
  '058',
  'GTBank',
  '0987654321',
  'NOTIFY USER',
  'RCP_notify_wd'
) as bank_id \gset

select public.request_wallet_withdrawal(
  '11111111-1111-1111-1111-111111111101'::uuid,
  500,
  :'bank_id'::uuid,
  'notify-wd-idem'
) as withdrawal_id \gset

select is(
  (
    select count(*)::int
    from public.notification_inbox ni
    where ni.user_id = '11111111-1111-1111-1111-111111111101'::uuid
      and ni.type = 'withdrawal_submitted'
      and ni.body = 'Your withdrawal request has been submitted.'
      and ni.url = format('/wallet/withdrawal/%s', :'withdrawal_id')
  ),
  1,
  'submitted notification is created once'
);

select public.request_wallet_withdrawal(
  '11111111-1111-1111-1111-111111111101'::uuid,
  500,
  :'bank_id'::uuid,
  'notify-wd-idem'
);

select is(
  (
    select count(*)::int
    from public.notification_inbox ni
    where ni.user_id = '11111111-1111-1111-1111-111111111101'::uuid
      and ni.type = 'withdrawal_submitted'
  ),
  1,
  'idempotent withdrawal request does not duplicate submitted notification'
);

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $$select public.admin_provision_member(
    '11111111-1111-1111-1111-111111111102'::uuid,
    'finance_admin'::public.admin_role
  )$$,
  'provision finance admin'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111102');

select lives_ok(
  format(
    $$select public.admin_begin_wallet_withdrawal_processing(
      %L::uuid,
      'notify-admin-process',
      null
    )$$,
    :'withdrawal_id'
  ),
  'move to processing'
);

select set_config('role', 'postgres', true);

select is(
  (
    select count(*)::int
    from public.notification_inbox ni
    where ni.user_id = '11111111-1111-1111-1111-111111111101'::uuid
      and ni.type = 'withdrawal_processing'
      and ni.body = 'Your withdrawal is being processed.'
  ),
  1,
  'processing notification after admin approval'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111102');

select lives_ok(
  format(
    $$select public.admin_complete_wallet_withdrawal(
      %L::uuid,
      'notify-admin-complete',
      'TRF-NOTIFY-1',
      null
    )$$,
    :'withdrawal_id'
  ),
  'complete withdrawal'
);

select set_config('role', 'postgres', true);

select is(
  (
    select count(*)::int
    from public.notification_inbox ni
    where ni.user_id = '11111111-1111-1111-1111-111111111101'::uuid
      and ni.type = 'withdrawal_successful'
      and ni.body = 'Your withdrawal has been completed.'
  ),
  1,
  'completed notification'
);

select set_config('role', 'service_role', true);

select public.request_wallet_withdrawal(
  '11111111-1111-1111-1111-111111111101'::uuid,
  400,
  :'bank_id'::uuid,
  'notify-reject-idem'
) as withdrawal_reject_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111102');

select lives_ok(
  format(
    $$select public.admin_reject_wallet_withdrawal(
      %L::uuid,
      'notify-admin-reject',
      'Does not meet policy',
      null
    )$$,
    :'withdrawal_reject_id'
  ),
  'reject withdrawal'
);

select set_config('role', 'postgres', true);

select is(
  (
    select count(*)::int
    from public.notification_inbox ni
    where ni.user_id = '11111111-1111-1111-1111-111111111101'::uuid
      and ni.type = 'withdrawal_failed'
      and ni.body = 'Your withdrawal request was declined. Your reserved funds have been returned.'
      and ni.url = format('/wallet/withdrawal/%s', :'withdrawal_reject_id')
  ),
  1,
  'rejected notification uses standard copy after funds release'
);

select w.id as reject_wd_id
from public.wallet_withdrawals w
where w.idempotency_key = 'notify-reject-idem' \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111102');

select is(
  public.admin_reject_wallet_withdrawal(
    :'reject_wd_id'::uuid,
    'notify-admin-reject',
    'Does not meet policy',
    null
  )::text,
  :'reject_wd_id',
  'idempotent reject does not duplicate failure notification'
);

select set_config('role', 'service_role', true);

select public.request_wallet_withdrawal(
  '11111111-1111-1111-1111-111111111101'::uuid,
  300,
  (
    select a.id
    from public.user_bank_accounts a
    where a.user_id = '11111111-1111-1111-1111-111111111101'::uuid
    limit 1
  ),
  'notify-fail-idem'
) as withdrawal_fail_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111102');

select lives_ok(
  format(
    $$select public.admin_begin_wallet_withdrawal_processing(
      %L::uuid,
      'notify-fail-process',
      null
    )$$,
    :'withdrawal_fail_id'
  ),
  'processing for fail notification test'
);

select lives_ok(
  format(
    $$select public.admin_fail_wallet_withdrawal(
      %L::uuid,
      'notify-admin-fail',
      'Bank transfer could not be completed.',
      null
    )$$,
    :'withdrawal_fail_id'
  ),
  'fail withdrawal after transfer issue'
);

select set_config('role', 'postgres', true);

select is(
  (
    select count(*)::int
    from public.notification_inbox ni
    where ni.user_id = '11111111-1111-1111-1111-111111111101'::uuid
      and ni.type = 'withdrawal_failed'
      and ni.body = 'Your withdrawal could not be completed. Your reserved funds have been returned.'
      and ni.url = format('/wallet/withdrawal/%s', :'withdrawal_fail_id')
  ),
  1,
  'failed notification after funds released'
);

select finish();

rollback;
