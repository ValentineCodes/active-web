-- Milestone payment backend coverage

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

select pg_temp.make_user('11111111-1111-1111-1111-111111111111', 'Milestone Requester', '+2348000000111') as _ \gset
select pg_temp.make_user('22222222-2222-2222-2222-222222222222', 'Milestone Helper', '+2348000000222') as _ \gset
select pg_temp.make_user('33333333-3333-3333-3333-333333333333', 'Single Helper', '+2348000000333') as _ \gset
select pg_temp.make_user('44444444-4444-4444-4444-444444444444', 'Guard Helper', '+2348000000444') as _ \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    '11111111-1111-1111-1111-111111111111'::uuid,
    2000000,
    'ms-requester-seed',
    'ms-seed'
  )$$,
  'seed requester wallet'
);

-- Single-payment backward compatibility (default create_request)
select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Single payment job',
  'Legacy flow unchanged.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as single_request_id \gset

select is(
  (select payment_structure::text from public.requests where id = :'single_request_id'::uuid),
  'single',
  'default payment_structure is single'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333') as _ \gset
select respond_to_request(
  :'single_request_id'::uuid,
  'I can help.',
  null,
  6.5000,
  3.3800
) as single_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select accept_response(%L::uuid)', :'single_response_id'),
  'single payment accept still works'
);

select throws_ok(
  $$select public.create_request(
    'Bad milestones',
    'Sum mismatch.',
    6.5, 3.38,
    'Lagos',
    null,
    5000,
    null,
    null,
    '{}'::uuid[],
    'milestone'::public.payment_structure,
    jsonb_build_array(
      jsonb_build_object('title', 'A', 'description', '', 'amount', 2000),
      jsonb_build_object('title', 'B', 'description', '', 'amount', 2000)
    )
  )$$,
  '22023',
  'milestone amounts must equal the offer total',
  'milestone validation rejects wrong sum'
);

select public.create_request(
  'Milestone paint job',
  'Paint in two phases.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  10000,
  null,
  null,
  '{}'::uuid[],
  'milestone'::public.payment_structure,
  jsonb_build_array(
    jsonb_build_object('title', 'Prep', 'description', 'Sand and prime.', 'amount', 4000),
    jsonb_build_object('title', 'Finish', 'description', 'Final coats.', 'amount', 6000)
  )
) as ms_request_id \gset

select is(
  (select count(*)::int from public.request_milestone_proposal_items i
   join public.request_milestone_proposals p on p.id = i.proposal_id
   where p.request_id = :'ms_request_id'::uuid),
  2,
  'milestone draft has two items'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'ms_request_id'::uuid,
  'Happy to help.',
  null,
  6.5000,
  3.3800
) as ms_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select accept_response(%L::uuid)', :'ms_response_id'),
  'accept locks full amount and snapshots milestones'
);

select is(
  (
    select pl.total
    from public.payment_locks pl
    where pl.request_id = :'ms_request_id'::uuid
  ),
  public.ngn_major_to_kobo(10000),
  'full offer locked on accept'
);

select is(
  (select count(*)::int from public.engagement_milestones where request_id = :'ms_request_id'::uuid),
  2,
  'engagement milestones snapshot at accept'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (
    select status::text from public.engagement_milestones
    where request_id = :'ms_request_id'::uuid and position = 1
  ),
  'in_progress',
  'first milestone active after accept (no separate start step)'
);

select throws_ok(
  format(
    $$select submit_engagement_milestone(
      (select id from public.engagement_milestones where request_id = %L::uuid and position = 2)
    )$$,
    :'ms_request_id'
  ),
  '55000',
  'earlier milestones must be approved before submitting this one',
  'cannot submit milestone 2 before milestone 1'
);

select lives_ok(
  format(
    $$select submit_engagement_milestone(
      (select id from public.engagement_milestones where request_id = %L::uuid and position = 1)
    )$$,
    :'ms_request_id'
  ),
  'helper submits milestone 1'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    $$select approve_engagement_milestone(
      (select id from public.engagement_milestones where request_id = %L::uuid and position = 1)
    )$$,
    :'ms_request_id'
  ),
  'requester approves milestone 1'
);

select is(
  (
    select pl.released_total_kobo
    from public.payment_locks pl
    where pl.request_id = :'ms_request_id'::uuid
  ),
  public.ngn_major_to_kobo(4000),
  'partial release after first milestone'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  coalesce(
    (
      select available_balance
      from public.wallets
      where user_id = '22222222-2222-2222-2222-222222222222'::uuid
    ),
    -1
  ),
  public.ngn_major_to_kobo(3600),
  'helper credited net of 10%% fee on first milestone (4000 offer → 3600 payout)'
);

select is(
  (
    select status::text from public.engagement_milestones
    where request_id = :'ms_request_id'::uuid and position = 2
  ),
  'in_progress',
  'second milestone becomes eligible'
);

-- duplicate approve idempotent
select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    $$select approve_engagement_milestone(
      (select id from public.engagement_milestones where request_id = %L::uuid and position = 1)
    )$$,
    :'ms_request_id'
  ),
  'duplicate approve is idempotent'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format(
    $$select submit_engagement_milestone(
      (select id from public.engagement_milestones where request_id = %L::uuid and position = 2)
    )$$,
    :'ms_request_id'
  ),
  'helper submits final milestone'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select throws_ok(
  format(
    $$select approve_engagement_milestone(
      (select id from public.engagement_milestones where request_id = %L::uuid and position = 2)
    )$$,
    :'ms_request_id'
  ),
  '42501',
  'only the requester can approve a milestone',
  'unauthorized approve rejected'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    $$select approve_engagement_milestone(
      (select id from public.engagement_milestones where request_id = %L::uuid and position = 2)
    )$$,
    :'ms_request_id'
  ),
  'final milestone approval completes engagement'
);

select is(
  (select status::text from public.requests where id = :'ms_request_id'::uuid),
  'completed',
  'request completed after final milestone'
);

select is(
  (select payment_status::text from public.requests where id = :'ms_request_id'::uuid),
  'released',
  'payment released after all milestones'
);

select throws_ok(
  format('select complete_request(%L)', :'ms_request_id'),
  '55000',
  'milestone engagements are completed through milestone approval',
  'complete_request blocked for milestone'
);

-- mark_service_complete guard (separate helper; extra funds for second lock)
select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    '11111111-1111-1111-1111-111111111111'::uuid,
    1000000,
    'ms-guard-top-up',
    'ms-guard'
  )$$,
  'top up for guard request lock'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Mark complete guard',
  'Still in progress.',
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
) as guard_request_id \gset

select pg_temp.act_as('44444444-4444-4444-4444-444444444444') as _ \gset
select respond_to_request(
  :'guard_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800
) as guard_resp_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select accept_response(:'guard_resp_id'::uuid) as _ \gset

select pg_temp.act_as('44444444-4444-4444-4444-444444444444') as _ \gset
select start_request(:'guard_request_id'::uuid) as _ \gset

select throws_ok(
  format('select mark_service_complete(%L)', :'guard_request_id'),
  '55000',
  'milestone engagements use per-milestone approval instead of marking the whole job complete',
  'mark_service_complete blocked for milestone'
);

-- Insufficient wallet on accept
select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'No funds milestone',
  'Should fail accept.',
  6.5000,
  3.3800,
  'Yaba',
  null,
  50000,
  null,
  null,
  '{}'::uuid[],
  'milestone'::public.payment_structure,
  jsonb_build_array(
    jsonb_build_object('title', 'A', 'description', 'x', 'amount', 25000),
    jsonb_build_object('title', 'B', 'description', 'y', 'amount', 25000)
  )
) as broke_ms_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'broke_ms_id'::uuid,
  null,
  null,
  6.5000,
  3.3800
) as broke_ms_resp \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select accept_response(%L::uuid)', :'broke_ms_resp'),
  '55000',
  null,
  'insufficient wallet blocks milestone accept'
);

select * from finish();

rollback;