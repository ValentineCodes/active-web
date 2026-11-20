-- Missed-delivery dismissal (distinct from failure-to-start). UD-21 blocks live dismiss.

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

select pg_temp.make_user('m1111111-1111-1111-1111-111111111111', 'Missed Req', '+2348000003001') as _ \gset
select pg_temp.make_user('m2222222-2222-2222-2222-222222222222', 'Missed Worker', '+2348000003002') as _ \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'm1111111-1111-1111-1111-111111111111'::uuid,
    5000000,
    'missed-dismiss-req',
    'missed-seed'
  )$$,
  'seed requester wallet'
);

-- Active in_progress engagement with binding deadline
select pg_temp.act_as('m1111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Missed delivery single',
  'Dismiss after deadline.',
  6.5000,
  3.3800,
  'Yaba',
  null,
  9000,
  null,
  null,
  '{}'::uuid[]
) as missed_request_id \gset

select pg_temp.act_as('m2222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'missed_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800,
  now() + interval '7 days'
) as missed_response_id \gset

select pg_temp.act_as('m1111111-1111-1111-1111-111111111111') as _ \gset
select accept_response(:'missed_response_id'::uuid) as _ \gset

select pg_temp.act_as('m2222222-2222-2222-2222-222222222222') as _ \gset
select start_request(:'missed_request_id'::uuid) as _ \gset

select pg_temp.act_as_owner() as _ \gset
update public.requests
set delivery_deadline_at = now() + interval '1 hour'
where id = :'missed_request_id'::uuid;

-- Permissions and deadline guards -------------------------------------------------------

select pg_temp.act_as('m2222222-2222-2222-2222-222222222222') as _ \gset
select throws_ok(
  format('select dismiss_worker_missed_delivery(%L::uuid)', :'missed_request_id'),
  'P0002',
  null,
  'worker cannot dismiss for missed delivery'
);

select pg_temp.act_as('m1111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select dismiss_worker_missed_delivery(%L::uuid)', :'missed_request_id'),
  '55000',
  null,
  'cannot dismiss before deadline passes'
);

select pg_temp.act_as_owner() as _ \gset
update public.requests
set delivery_deadline_at = now() - interval '1 minute'
where id = :'missed_request_id'::uuid;

select throws_ok(
  format('select dismiss_worker_failure_to_start(%L::uuid)', :'missed_request_id'),
  '55000',
  null,
  'failure-to-start dismiss rejected after worker started'
);

select pg_temp.act_as('m1111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select dismiss_worker_missed_delivery(%L::uuid)', :'missed_request_id'),
  'P0001',
  null,
  'UD-21 gate blocks missed-delivery dismiss'
);

-- Dispute / open report hold ----------------------------------------------------------

select pg_temp.act_as_owner() as _ \gset
update public.requests
set status = 'disputed'::public.request_status,
    payment_status = 'disputed'::public.payment_status
where id = :'missed_request_id'::uuid;

select pg_temp.act_as('m1111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select dismiss_worker_missed_delivery(%L::uuid)', :'missed_request_id'),
  '55000',
  null,
  'disputed engagement cannot be dismissed for missed delivery'
);

-- Remaining escrow refund (single payment) ---------------------------------------------

select pg_temp.act_as('m1111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Refund remainder single',
  'Wallet remainder refund test.',
  6.5000,
  3.3800,
  'Yaba',
  null,
  9001,
  null,
  null,
  '{}'::uuid[]
) as refund_single_id \gset

select pg_temp.act_as('m2222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'refund_single_id'::uuid,
  null,
  null,
  6.5000,
  3.3800,
  now() + interval '7 days'
) as refund_single_resp \gset

select pg_temp.act_as('m1111111-1111-1111-1111-111111111111') as _ \gset
select accept_response(:'refund_single_resp'::uuid) as _ \gset

select pg_temp.act_as_owner() as _ \gset
select is(
  (
    select pl.total
    from public.payment_locks pl
    where pl.request_id = :'refund_single_id'::uuid
  ),
  public.ngn_major_to_kobo(6500),
  'full offer locked for single payment'
);

select lives_ok(
  format(
    $$select public.apply_payment_transition(
      %L::uuid,
      'refunded'::public.payment_status,
      'missed_remainder_single'
    )$$,
    :'refund_single_id'
  ),
  'remaining escrow refund via payment transition'
);

select is(
  (
    select pl.status::text
    from public.payment_locks pl
    where pl.request_id = :'refund_single_id'::uuid
  ),
  'refunded',
  'lock terminal after remainder refund'
);

select is(
  (
    select count(*)::int
    from public.wallet_transactions wt
    where wt.request_id = :'refund_single_id'::uuid
      and wt.type = 'refund'::public.wallet_transaction_type
  ),
  1,
  'single refund entry for full lock'
);

select is(
  (
    select count(*)::int
    from public.wallet_transactions wt
    where wt.request_id = :'refund_single_id'::uuid
      and wt.type = 'service_fee'::public.wallet_transaction_type
  ),
  0,
  'no service fee on missed-delivery remainder refund'
);

select lives_ok(
  format(
    $$select public.apply_payment_transition(
      %L::uuid,
      'refunded'::public.payment_status,
      'missed_remainder_single'
    )$$,
    :'refund_single_id'
  ),
  'duplicate payment transition idempotent'
);

-- Milestone Option B: released slice preserved ------------------------------------------

select pg_temp.act_as('m1111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Missed milestone partial',
  'Option B remainder refund.',
  6.5000,
  3.3800,
  'Yaba',
  null,
  9002,
  null,
  null,
  '{}'::uuid[],
  'milestone'::public.payment_structure,
  jsonb_build_array(
    jsonb_build_object('title', 'A', 'description', 'a', 'amount', 3250),
    jsonb_build_object('title', 'B', 'description', 'b', 'amount', 3250)
  )
) as ms_refund_id \gset

select pg_temp.act_as('m2222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'ms_refund_id'::uuid,
  null,
  null,
  6.5000,
  3.3800,
  now() + interval '7 days'
) as ms_refund_resp \gset

select pg_temp.act_as('m1111111-1111-1111-1111-111111111111') as _ \gset
select accept_response(:'ms_refund_resp'::uuid) as _ \gset

select pg_temp.act_as('m2222222-2222-2222-2222-222222222222') as _ \gset
select start_request(:'ms_refund_id'::uuid) as _ \gset

select lives_ok(
  format(
    $$select submit_engagement_milestone(
      (select id from public.engagement_milestones where request_id = %L::uuid and position = 1)
    )$$,
    :'ms_refund_id'
  ),
  'submit milestone 1'
);

select pg_temp.act_as('m1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    $$select approve_engagement_milestone(
      (select id from public.engagement_milestones where request_id = %L::uuid and position = 1)
    )$$,
    :'ms_refund_id'
  ),
  'approve milestone 1'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (
    select pl.released_total_kobo
    from public.payment_locks pl
    where pl.request_id = :'ms_refund_id'::uuid
  ),
  public.ngn_major_to_kobo(3250),
  'first milestone released before missed dismiss refund'
);

select is(
  coalesce(
    (
      select available_balance
      from public.wallets
      where user_id = 'm2222222-2222-2222-2222-222222222222'::uuid
    ),
    -1
  ),
  public.ngn_major_to_kobo(2925),
  'worker keeps approved milestone payout net of fee'
);

select lives_ok(
  format(
    $$select public.apply_payment_transition(
      %L::uuid,
      'refunded'::public.payment_status,
      'missed_remainder_milestone'
    )$$,
    :'ms_refund_id'
  ),
  'refund remaining locked escrow after partial milestone release'
);

select is(
  (
    select pl.released_total_kobo
    from public.payment_locks pl
    where pl.request_id = :'ms_refund_id'::uuid
  ),
  public.ngn_major_to_kobo(3250),
  'released milestone counters unchanged by remainder refund'
);

select is(
  (
    select count(*)::int
    from public.wallet_transactions wt
    where wt.request_id = :'ms_refund_id'::uuid
      and wt.type = 'payout'::public.wallet_transaction_type
  ),
  1,
  'no reversal of milestone payout entries'
);

select is(
  (
    select sum(wt.available_delta_kobo)
    from public.wallet_transactions wt
    where wt.request_id = :'ms_refund_id'::uuid
      and wt.user_id = 'm1111111-1111-1111-1111-111111111111'::uuid
      and wt.type = 'refund'::public.wallet_transaction_type
  ),
  public.ngn_major_to_kobo(3250),
  'creator refunded unreleased half only'
);

select * from finish();

rollback;