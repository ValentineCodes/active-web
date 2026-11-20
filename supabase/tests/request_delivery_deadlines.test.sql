-- Calendar delivery deadlines and mutual extensions

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
select create_request(
  'Deadline single job',
  'Calendar delivery deadline tests.',
  6.5000,
  3.3800,
  'Yaba',
  null,
  8000,
  null,
  null,
  '{}'::uuid[]
) as deadline_request_id \gset

select throws_ok(
  format(
    'select respond_to_request(%L::uuid, null, null, 6.5000, 3.3800, now() - interval ''1 hour'')',
    :'deadline_request_id'
  ),
  '55000',
  null,
  'past proposed delivery rejected'
);

select throws_ok(
  format(
    'select respond_to_request(%L::uuid, null, null, 6.5000, 3.3800, now() + interval ''7 days'', %L)',
    :'deadline_request_id',
    'Not/A_Timezone'
  ),
  '22023',
  null,
  'invalid timezone rejected'
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'deadline_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800,
  now() + interval '10 days',
  'Africa/Lagos'
) as deadline_response_id \gset

select ok(
  (
    select proposed_delivery_at is not null
       and proposed_delivery_timezone = 'Africa/Lagos'
    from public.request_responses
    where id = :'deadline_response_id'::uuid
  ),
  'response stores proposed delivery and timezone'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select accept_response(:'deadline_response_id'::uuid) as _ \gset

select ok(
  (
    select proposed_delivery_at is not null
       and adjusted_delivery_at is null
       and delivery_deadline_at is null
    from public.requests
    where id = :'deadline_request_id'::uuid
  ),
  'accept preserves proposal without starting delivery countdown'
);

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  format(
    $q$
      update public.requests
      set accepted_at = timestamptz '2026-06-01 10:00:00+00'
      where id = %L::uuid
    $q$,
    :'deadline_request_id'
  ),
  'patch accepted_at for shift example'
);

select lives_ok(
  format(
    $q$
      update public.requests
      set proposed_delivery_at = timestamptz '2026-05-30 17:00:00+00'
      where id = %L::uuid
    $q$,
    :'deadline_request_id'
  ),
  'patch proposed delivery for shift example'
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select start_request(%L::uuid)', :'deadline_request_id'),
  'worker starts request'
);

select is(
  (
    select adjusted_delivery_at
    from public.requests
    where id = :'deadline_request_id'::uuid
  ),
  (
    select public.compute_shifted_delivery_deadline(
      timestamptz '2026-05-30 17:00:00+00',
      timestamptz '2026-06-01 10:00:00+00',
      started_at
    )
    from public.requests
    where id = :'deadline_request_id'::uuid
  ),
  'adjusted deadline shifts by acceptance-to-start elapsed time'
);

select ok(
  (
    select delivery_deadline_at = adjusted_delivery_at
    from public.requests
    where id = :'deadline_request_id'::uuid
  ),
  'binding delivery deadline set on start'
);

select ok(
  (
    select adjusted_delivery_at <= started_at + public.request_engagement_max_delivery_interval()
    from public.requests
    where id = :'deadline_request_id'::uuid
  ),
  'adjusted deadline within 30 days from start'
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select start_request(%L::uuid)', :'deadline_request_id'),
  'duplicate start is idempotent'
);

select is(
  (
    select count(*)::int
    from public.requests
    where id = :'deadline_request_id'::uuid
      and started_at is not null
  ),
  1,
  'started_at unchanged after duplicate start'
);

-- 30-day cap at Start -------------------------------------------------------------------

select pg_temp.act_as_owner() as _ \gset
select create_request(
  'Deadline cap job',
  'Too far proposed delivery.',
  6.5000,
  3.3800,
  'Yaba',
  null,
  8001,
  null,
  null,
  '{}'::uuid[]
) as cap_request_id \gset

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'cap_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800,
  now() + interval '29 days',
  'Africa/Lagos'
) as cap_response_id \gset

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select accept_response(:'cap_response_id'::uuid) as _ \gset

select pg_temp.act_as_owner() as _ \gset
update public.requests
set accepted_at = now() - interval '2 hours',
    start_by_at = now() + interval '1 hour',
    proposed_delivery_at = now() + interval '31 days'
where id = :'cap_request_id'::uuid;

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select throws_ok(
  format('select start_request(%L::uuid)', :'cap_request_id'),
  '55000',
  null,
  'start rejects adjusted deadline beyond 30 days from start'
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

select ok(
  (
    select delivery_deadline_at
    from public.requests
    where id = :'deadline_request_id'::uuid
  ) <>
  (
    select proposed_deadline_at
    from public.request_delivery_deadline_extensions
    where id = :'ext_id'::uuid
  ),
  'creator-only extension does not change deadline yet'
);

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
       and e.creator_consented_at is not null
       and e.worker_consented_at is not null
    from public.request_delivery_deadline_extensions e
    join public.requests r on r.id = e.request_id
    where e.id = :'ext_id'::uuid
  ),
  'mutual extension updates binding deadline and audit trail'
);

select throws_ok(
  format(
    'select agree_delivery_extension(%L::uuid, now() + interval ''60 days'')',
    :'deadline_request_id'
  ),
  '55000',
  null,
  'extension beyond maximum from start rejected'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select agree_delivery_extension(
  :'deadline_request_id'::uuid,
  (
    select delivery_deadline_at + interval '1 day'
    from public.requests
    where id = :'deadline_request_id'::uuid
  )
) as ext2_id \gset

select throws_ok(
  format(
    'select agree_delivery_extension(%L::uuid, (select proposed_deadline_at from public.request_delivery_deadline_extensions where id = %L::uuid))',
    :'deadline_request_id',
    :'ext2_id'
  ),
  '55000',
  null,
  'duplicate creator consent rejected'
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select agree_delivery_extension(
  :'deadline_request_id'::uuid,
  (
    select delivery_deadline_at + interval '3 days'
    from public.requests
    where id = :'deadline_request_id'::uuid
  )
) as worker_only_ext \gset

select ok(
  (
    select r.delivery_deadline_at = e.original_deadline_at
    from public.requests r
    join public.request_delivery_deadline_extensions e on e.id = :'worker_only_ext'::uuid
    where r.id = :'deadline_request_id'::uuid
  ),
  'worker-only extension does not change deadline until creator consents'
);

select pg_temp.act_as_owner() as _ \gset
update public.requests
set delivery_deadline_at = now() - interval '1 minute'
where id = :'deadline_request_id'::uuid;

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format(
    'select agree_delivery_extension(%L::uuid, now() + interval ''5 days'')',
    :'deadline_request_id'
  ),
  '55000',
  null,
  'extension after current deadline expiry rejected'
);

-- DST: absolute timestamptz arithmetic -----------------------------------------------

select is(
  public.compute_shifted_delivery_deadline(
    timestamptz '2024-03-08 17:00:00-05',
    timestamptz '2024-03-10 10:00:00-04',
    timestamptz '2024-03-11 08:00:00-04'
  ),
  timestamptz '2024-03-09 20:00:00+00',
  'shift math respects daylight-saving instants'
);

select * from finish();

rollback;