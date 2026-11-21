-- Creator accept/reject of worker-initiated project responses

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

create function pg_temp.make_user(p_id uuid, p_name text, p_phone text)
returns text language plpgsql as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, phone, phone_confirmed_at, created_at, updated_at
  ) values (
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
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  return p_id::text;
end;
$$;

create function pg_temp.act_as_owner()
returns text language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return 'postgres';
end;
$$;

select pg_temp.make_user('d1111111-1111-1111-1111-111111111111', 'Review Creator', '+2348000007001') as _ \gset
select pg_temp.make_user('d2222222-2222-2222-2222-222222222222', 'Review Worker', '+2348000007002') as _ \gset
select pg_temp.make_user('d3333333-3333-3333-3333-333333333333', 'Contributor', '+2348000007003') as _ \gset
select pg_temp.make_user('d4444444-4444-4444-4444-444444444444', 'Stranger', '+2348000007004') as _ \gset

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'premium creator');

select public.create_project(
  'Response review project',
  'Review flow test',
  null,
  '{}'::uuid[],
  'public'::public.project_funding_visibility,
  20000,
  8000,
  500,
  (current_date + 10),
  null,
  'Africa/Lagos', 6.5244, 3.3792, 'Lagos, Nigeria'
) as project_id \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'd1111111-1111-1111-1111-111111111111'::uuid,
    25000000,
    'review-pool',
    'review-pool-ref'
  )$$,
  'fund creator wallet'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.contribute_to_project(%L::uuid, 10000, %L)', :'project_id', 'review-hit-min'),
  'meet minimum funding'
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'premium worker');

select public.respond_to_project(
  :'project_id'::uuid,
  'I can deliver this scope.',
  5000,
  2,
  'weeks'::public.delivery_duration_unit
) as response_assignment_id \gset

select is(
  (select status::text from public.get_my_project_response(:'project_id'::uuid)),
  'offered',
  'new worker response is offered'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select ok(
  (select creator_may_review from public.list_project_responses(:'project_id'::uuid) limit 1),
  'creator sees reviewable response'
);

select lives_ok(
  format('select public.accept_project_worker_response(%L::uuid)', :'response_assignment_id'),
  'creator accepts worker response'
);

select is(
  (
    select status::text
    from public.list_project_responses(:'project_id'::uuid)
    where worker_id = 'd2222222-2222-2222-2222-222222222222'::uuid
    limit 1
  ),
  'accepted',
  'assignment accepted after creator acceptance'
);

select ok(
  (select reservation_secured from public.get_project_assignment(:'response_assignment_id'::uuid)),
  'acceptance secures full assignment compensation from the pool'
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select cmp_ok(
  (select count(*)::bigint from public.notification_inbox
   where user_id = 'd2222222-2222-2222-2222-222222222222'::uuid
     and dedupe_key = public.notification_dedupe_key(
       'response_accepted'::public.notification_type,
       'd2222222-2222-2222-2222-222222222222'::uuid,
       'project_assignment:' || :'response_assignment_id' || ':accepted_by_creator'
     )),
  '>=',
  1::bigint,
  'worker notified on accept'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset

select ok(
  NOT (select creator_may_review from public.list_project_responses(:'project_id'::uuid) where assignment_id = :'response_assignment_id'::uuid),
  'accepted response no longer reviewable in list'
);

select lives_ok(
  format('select public.accept_project_worker_response(%L::uuid)', :'response_assignment_id'),
  'duplicate accept is idempotent'
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select public.start_project_assignment(%L::uuid)', :'response_assignment_id'),
  'worker may commence after acceptance secured compensation'
);

-- Accept fails when pool cannot secure agreed compensation
select pg_temp.act_as('d4444444-4444-4444-4444-444444444444') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'premium stranger worker for oversize offer');

select public.respond_to_project(
  :'project_id'::uuid,
  'Too expensive for current pool',
  15000,
  2,
  'weeks'::public.delivery_duration_unit
) as oversize_assignment_id \gset

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select public.accept_project_worker_response(%L::uuid)', :'oversize_assignment_id'),
  '55000',
  'Contributed project funds are not enough to secure this worker''s compensation. Add pool contributions or lower the agreed amount, then try again.',
  'accept rejects when pool cannot secure compensation'
);

select ok(
  NOT (select reservation_secured from public.get_project_assignment(:'oversize_assignment_id'::uuid)),
  'oversize response stays without reservation when accept fails'
);

-- Reject path on a second worker response (reuse stranger worker row from oversize offer)
select pg_temp.act_as('d4444444-4444-4444-4444-444444444444') as _ \gset

select public.respond_to_project(
  :'project_id'::uuid,
  'Alternative offer',
  4500,
  10,
  'days'::public.delivery_duration_unit
) as reject_assignment_id \gset

select pg_temp.act_as('d3333333-3333-3333-3333-333333333333') as _ \gset
select throws_ok(
  format('select public.accept_project_worker_response(%L::uuid)', :'reject_assignment_id'),
  'P0002',
  null,
  'contributor cannot accept'
);

select pg_temp.act_as('d4444444-4444-4444-4444-444444444444') as _ \gset
select throws_ok(
  format('select public.accept_project_worker_response(%L::uuid)', :'reject_assignment_id'),
  'P0002',
  null,
  'unrelated user cannot accept'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.reject_project_worker_response(%L::uuid, %L)', :'reject_assignment_id', 'Budget fit'),
  'creator rejects response'
);

select throws_ok(
  format('select public.accept_project_worker_response(%L::uuid)', :'reject_assignment_id'),
  '55000',
  null,
  'rejected response cannot be accepted later'
);

select is(
  (select count(*)::int from public.list_project_responses(:'project_id'::uuid) where assignment_id = :'reject_assignment_id'::uuid),
  0,
  'cancelled response omitted from list'
);

-- Worker withdraw pending vs accepted
select pg_temp.act_as('d4444444-4444-4444-4444-444444444444') as _ \gset
select lives_ok(
  format('select public.respond_to_project(%L::uuid, %L, 3000, 3, %L)', :'project_id', 'third offer', 'days'),
  'worker may submit new response after rejection'
) as third_assignment_id \gset

select lives_ok(
  format('select public.withdraw_project_response(%L::uuid)', :'project_id'),
  'worker withdraws pending response'
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select throws_ok(
  format('select public.withdraw_project_response(%L::uuid)', :'project_id'),
  'P0002',
  null,
  'worker cannot withdraw accepted assignment as response'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select public.reject_project_worker_response(%L::uuid, null)', :'response_assignment_id'),
  '55000',
  null,
  'creator cannot reject already accepted assignment'
);

select * from finish();

rollback;