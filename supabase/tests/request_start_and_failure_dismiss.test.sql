-- Universal Start window and failure-to-start dismissal

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

select pg_temp.make_user('a1111111-1111-1111-1111-111111111111', 'Start Requester', '+2348000001001') as _ \gset
select pg_temp.make_user('a2222222-2222-2222-2222-222222222222', 'Start Worker', '+2348000001002') as _ \gset
select pg_temp.make_user('a3333333-3333-3333-3333-333333333333', 'Other Worker', '+2348000001003') as _ \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'a1111111-1111-1111-1111-111111111111'::uuid,
    5000000,
    'start-test-requester',
    'start-seed'
  )$$,
  'seed requester wallet'
);

-- Single-payment request ----------------------------------------------------------------

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Start single job',
  'Test universal start workflow.',
  6.5000,
  3.3800,
  'Yaba',
  null,
  8000,
  null,
  null,
  '{}'::uuid[]
) as single_request_id \gset

select pg_temp.act_as('a2222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'single_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800,
  now() + interval '7 days'
) as single_response_id \gset

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select accept_response(:'single_response_id'::uuid) as _ \gset

select ok(
  (
    select start_by_at > accepted_at
    from public.requests
    where id = :'single_request_id'::uuid
  ),
  'start_by_at set on accept'
);

select throws_ok(
  format('select start_request(%L::uuid)', :'single_request_id'),
  'P0002',
  null,
  'wrong worker cannot start'
);

select pg_temp.act_as('a3333333-3333-3333-3333-333333333333') as _ \gset
select throws_ok(
  format('select start_request(%L::uuid)', :'single_request_id'),
  'P0002',
  null,
  'unrelated user cannot start'
);

select throws_ok(
  format('select dismiss_worker_failure_to_start(%L::uuid)', :'single_request_id'),
  'P0002',
  null,
  'worker cannot dismiss'
);

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select dismiss_worker_failure_to_start(%L::uuid)', :'single_request_id'),
  '55000',
  'the start window has not ended yet',
  'dismiss blocked before window ends'
);

select pg_temp.act_as('a2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select start_request(%L::uuid)', :'single_request_id'),
  'worker starts within window'
);

select is(
  (select request_status::text from get_engagement(:'single_request_id')),
  'in_progress',
  'start moves request to in_progress'
);

select ok(
  (
    select started_at is not null
    from public.requests
    where id = :'single_request_id'::uuid
  ),
  'started_at recorded'
);

select lives_ok(
  format('select start_request(%L::uuid)', :'single_request_id'),
  'duplicate start is idempotent'
);

select is(
  (
    with first as (
      select started_at as t
      from public.requests
      where id = :'single_request_id'::uuid
    ),
    second as (
      select started_at as t
      from public.requests
      where id = :'single_request_id'::uuid
    )
    select first.t = second.t from first, second
  ),
  'duplicate start does not change started_at'
);

-- Failure-to-start dismiss on second request ------------------------------------------------

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Dismiss single job',
  'No start test.',
  6.5000,
  3.3800,
  'Yaba',
  null,
  7000,
  null,
  null,
  '{}'::uuid[]
) as dismiss_request_id \gset

select pg_temp.act_as('a2222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'dismiss_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800,
  now() + interval '7 days'
) as dismiss_response_id \gset

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select accept_response(:'dismiss_response_id'::uuid) as _ \gset

select pg_temp.act_as_owner() as _ \gset
update public.requests
set accepted_at = now() - interval '25 hours',
    start_by_at = now() - interval '1 hour'
where id = :'dismiss_request_id'::uuid;

select pg_temp.act_as('a2222222-2222-2222-2222-222222222222') as _ \gset
select throws_ok(
  format('select start_request(%L::uuid)', :'dismiss_request_id'),
  '55000',
  'the start window has expired',
  'late start rejected'
);

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select dismiss_worker_failure_to_start(%L::uuid)', :'dismiss_request_id'),
  'creator dismisses after window'
);

select is(
  (select status::text from public.requests where id = :'dismiss_request_id'::uuid),
  'no_show',
  'dismiss sets no_show status'
);

select is(
  (select payment_status::text from public.requests where id = :'dismiss_request_id'::uuid),
  'refunded',
  'payment refunded on dismiss'
);

select is(
  (
    select pl.status::text
    from public.payment_locks pl
    where pl.request_id = :'dismiss_request_id'::uuid
  ),
  'refunded',
  'payment lock refunded'
);

select is(
  (
    select count(*)::int
    from public.wallet_transactions wt
    where wt.request_id = :'dismiss_request_id'::uuid
      and wt.type = 'refund'::public.wallet_transaction_type
  ),
  1,
  'single refund ledger entry'
);

select is(
  (
    select count(*)::int
    from public.wallet_transactions wt
    where wt.request_id = :'dismiss_request_id'::uuid
      and wt.type = 'service_fee'::public.wallet_transaction_type
  ),
  0,
  'no service fee on failure-to-start refund'
);

select lives_ok(
  format('select dismiss_worker_failure_to_start(%L::uuid)', :'dismiss_request_id'),
  'duplicate dismiss is idempotent'
);

-- Milestone failure-to-start full lock refund -----------------------------------------------

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Dismiss milestone job',
  'Milestone no start.',
  6.5000,
  3.3800,
  'Yaba',
  null,
  6000,
  null,
  null,
  '{}'::uuid[],
  'milestone'::public.payment_structure,
  jsonb_build_array(
    jsonb_build_object('title', 'A', 'description', 'a', 'amount', 3000),
    jsonb_build_object('title', 'B', 'description', 'b', 'amount', 3000)
  )
) as ms_dismiss_id \gset

select pg_temp.act_as('a2222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'ms_dismiss_id'::uuid,
  null,
  null,
  6.5000,
  3.3800,
  now() + interval '7 days'
) as ms_dismiss_resp \gset

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select accept_response(:'ms_dismiss_resp'::uuid) as _ \gset

select pg_temp.act_as_owner() as _ \gset
update public.requests
set accepted_at = now() - interval '30 hours',
    start_by_at = now() - interval '6 hours'
where id = :'ms_dismiss_id'::uuid;

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select dismiss_worker_failure_to_start(%L::uuid)', :'ms_dismiss_id'),
  'milestone dismiss after window'
);

select is(
  (
    select pl.total
    from public.payment_locks pl
    where pl.request_id = :'ms_dismiss_id'::uuid
  ),
  public.ngn_major_to_kobo(6000),
  'milestone lock had full amount before dismiss'
);

select is(
  (select payment_status::text from public.requests where id = :'ms_dismiss_id'::uuid),
  'refunded',
  'milestone payment refunded'
);

-- Race: start wins while still inside window on third request -----------------------------

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Race job',
  'Start versus dismiss race.',
  6.5000,
  3.3800,
  'Yaba',
  null,
  5000,
  null,
  null,
  '{}'::uuid[]
) as race_request_id \gset

select pg_temp.act_as('a2222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'race_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800,
  now() + interval '7 days'
) as race_response_id \gset

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select accept_response(:'race_response_id'::uuid) as _ \gset

select pg_temp.act_as('a2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select start_request(%L::uuid)', :'race_request_id'),
  'start succeeds before dismiss window'
);

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select dismiss_worker_failure_to_start(%L::uuid)', :'race_request_id'),
  '55000',
  'the worker has already started',
  'dismiss blocked after start'
);

select * from finish();

rollback;