-- Delivery duration proposals, Start deadline calculation, mutual extensions, legacy calendar.

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

select pg_temp.make_user('d1111111-1111-1111-1111-111111111111', 'Deadline Requester', '+2348000002001') as _ \gset
select pg_temp.make_user('d2222222-2222-2222-2222-222222222222', 'Deadline Worker', '+2348000002002') as _ \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'd1111111-1111-1111-1111-111111111111'::uuid,
    5000000,
    'deadline-test-requester',
    'deadline-seed'
  )$$,
  'seed requester wallet'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select public.create_request(
  p_title := 'Deadline single job'::text,
  p_description := 'Duration delivery deadline tests.'::text,
  p_latitude := 6.5000,
  p_longitude := 3.3800,
  p_location_label := 'Yaba'::text,
  p_offered_amount := 8000::numeric,
  p_payment_structure := 'single'::public.payment_structure
) as deadline_request_id \gset

select throws_ok(
  format(
    'select respond_to_request(%L::uuid, null, null, 6.5000, 3.3800, 0, %L::public.delivery_duration_unit)',
    :'deadline_request_id',
    'days'
  ),
  '22023',
  null,
  'zero duration rejected'
);

select throws_ok(
  format(
    'select respond_to_request(%L::uuid, null, null, 6.5000, 3.3800, 5, %L::public.delivery_duration_unit)',
    :'deadline_request_id',
    'weeks'
  ),
  '55000',
  null,
  'over 30 days rejected (5 weeks)'
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'deadline_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800,
  10,
  'days'::public.delivery_duration_unit
) as deadline_response_id \gset

select ok(
  (
    select proposed_delivery_duration_seconds = 864000
       and proposed_delivery_duration_value = 10
       and proposed_delivery_duration_unit = 'days'::public.delivery_duration_unit
       and proposed_delivery_at is null
    from public.request_responses
    where id = :'deadline_response_id'::uuid
  ),
  'response stores normalized duration'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select accept_response(:'deadline_response_id'::uuid) as _ \gset

select ok(
  (
    select proposed_delivery_duration_seconds = 864000
       and adjusted_delivery_at is null
       and delivery_deadline_at is null
    from public.requests
    where id = :'deadline_request_id'::uuid
  ),
  'accept preserves duration without starting delivery countdown'
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select start_request(%L::uuid)', :'deadline_request_id'),
  'worker starts request'
);

select ok(
  (
    select adjusted_delivery_at = started_at + interval '10 days'
       and delivery_deadline_at = adjusted_delivery_at
    from public.requests
    where id = :'deadline_request_id'::uuid
  ),
  'binding deadline is started_at plus proposed duration'
);

select ok(
  (
    select adjusted_delivery_at <= started_at + public.request_engagement_max_delivery_interval()
    from public.requests
    where id = :'deadline_request_id'::uuid
  ),
  'adjusted deadline within 30 days from start'
);

select lives_ok(
  format('select start_request(%L::uuid)', :'deadline_request_id'),
  'duplicate start is idempotent'
);

-- Max at Start via late start + long duration ------------------------------------------

select pg_temp.act_as_owner() as _ \gset
select public.create_request(
  p_title := 'Deadline cap job'::text,
  p_description := 'Too long duration at start.'::text,
  p_latitude := 6.5000,
  p_longitude := 3.3800,
  p_location_label := 'Yaba'::text,
  p_offered_amount := 8001::numeric,
  p_payment_structure := 'single'::public.payment_structure
) as cap_request_id \gset

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'cap_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800,
  4,
  'weeks'::public.delivery_duration_unit
) as cap_response_id \gset

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select accept_response(:'cap_response_id'::uuid) as _ \gset

select pg_temp.act_as_owner() as _ \gset
update public.requests
set accepted_at = now() - interval '2 hours',
    start_by_at = now() + interval '1 hour',
    proposed_delivery_duration_seconds = public.request_engagement_max_delivery_seconds() + 60
where id = :'cap_request_id'::uuid;

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select throws_ok(
  format('select start_request(%L::uuid)', :'cap_request_id'),
  '55000',
  null,
  'start rejects deadline beyond 30 days from start'
);

-- Legacy calendar engagements keep shift behaviour ---------------------------

select pg_temp.act_as_owner() as _ \gset
select public.create_request(
  p_title := 'Legacy calendar job'::text,
  p_description := 'Historical calendar proposal.'::text,
  p_latitude := 6.5000,
  p_longitude := 3.3800,
  p_location_label := 'Yaba'::text,
  p_offered_amount := 8002::numeric,
  p_payment_structure := 'single'::public.payment_structure
) as legacy_request_id \gset

insert into public.request_responses (
  request_id,
  responder_id,
  distance_m,
  expires_at,
  status,
  proposed_delivery_at,
  proposed_delivery_timezone
)
select
  :'legacy_request_id'::uuid,
  'd2222222-2222-2222-2222-222222222222'::uuid,
  500,
  r.expires_at,
  'pending'::public.response_status,
  now() + interval '5 days',
  'Africa/Lagos'
from public.requests r
where r.id = :'legacy_request_id'::uuid
returning id as legacy_response_id \gset

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select accept_response(:'legacy_response_id'::uuid) as _ \gset

select pg_temp.act_as_owner() as _ \gset
update public.requests
set accepted_at = timestamptz '2026-06-01 10:00:00+00',
    proposed_delivery_at = timestamptz '2026-05-30 17:00:00+00'
where id = :'legacy_request_id'::uuid;

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select start_request(%L::uuid)', :'legacy_request_id'),
  'legacy start shifts calendar proposal'
);

select is(
  (
    select adjusted_delivery_at
    from public.requests
    where id = :'legacy_request_id'::uuid
  ),
  (
    select public.compute_shifted_delivery_deadline(
      timestamptz '2026-05-30 17:00:00+00',
      timestamptz '2026-06-01 10:00:00+00',
      started_at
    )
    from public.requests
    where id = :'legacy_request_id'::uuid
  ),
  'legacy adjusted deadline still shifts by acceptance-to-start elapsed time'
);

-- Mutual extensions ---------------------------------------------------------------------

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select agree_delivery_extension(
  :'deadline_request_id'::uuid,
  (
    select delivery_deadline_at + interval '2 days'
    from public.requests
    where id = :'deadline_request_id'::uuid
  )
) as ext_id \gset

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select agree_delivery_extension(
  :'deadline_request_id'::uuid,
  (
    select proposed_deadline_at
    from public.request_delivery_deadline_extensions
    where id = :'ext_id'::uuid
  )
) as _ext_worker \gset

select ok(
  (
    select e.status = 'agreed'
       and e.final_deadline_at = r.delivery_deadline_at
    from public.request_delivery_deadline_extensions e
    join public.requests r on r.id = e.request_id
    where e.id = :'ext_id'::uuid
  ),
  'mutual extension updates binding deadline'
);

select is(
  public.compute_shifted_delivery_deadline(
    timestamptz '2024-03-08 17:00:00-05',
    timestamptz '2024-03-10 10:00:00-04',
    timestamptz '2024-03-11 08:00:00-04'
  ),
  timestamptz '2024-03-09 20:00:00+00',
  'legacy shift math respects daylight-saving instants'
);

select * from finish();

rollback;