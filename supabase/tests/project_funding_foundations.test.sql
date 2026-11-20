-- Project funding foundations (pool, contributions, deadline, visibility)

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

select pg_temp.make_user('a1111111-1111-1111-1111-111111111111', 'Project Creator', '+2348000004001') as _ \gset
select pg_temp.make_user('a2222222-2222-2222-2222-222222222222', 'Contributor A', '+2348000004002') as _ \gset
select pg_temp.make_user('a3333333-3333-3333-3333-333333333333', 'Contributor B', '+2348000004003') as _ \gset

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  $$select public.create_project(
    'My collab',
    'Desc',
    null,
    '{}'::uuid[],
    'public'::public.project_funding_visibility,
    10000,
    5000,
    1000,
    (current_date + 7),
    null,
    'Africa/Lagos'
  )$$,
  '55000',
  null,
  'premium required before create'
);

select lives_ok($$select public.start_premium_trial()$$, 'start premium trial');
select throws_ok($$select public.start_premium_trial()$$, '55000', null, 'trial once per account');

select throws_ok(
  $$select public.create_project(
    'Too soon',
    null,
    null,
    '{}'::uuid[],
    'public'::public.project_funding_visibility,
    10000,
    5000,
    1000,
    current_date,
    null,
    'Africa/Lagos'
  )$$,
  '55000',
  null,
  'deadline below minimum one-day period'
);

select throws_ok(
  $$select public.create_project(
    'Too late',
    null,
    null,
    '{}'::uuid[],
    'public'::public.project_funding_visibility,
    10000,
    5000,
    1000,
    (current_date + 31),
    null,
    'Africa/Lagos'
  )$$,
  '55000',
  null,
  'deadline exceeds thirty-day maximum'
);

select public.create_project(
  'Community build',
  'Pool test project.',
  null,
  '{}'::uuid[],
  'invite_only'::public.project_funding_visibility,
  10000,
  5000,
  1000,
  (current_date + 7),
  null,
  'Africa/Lagos'
) as project_id \gset

select is(
  (
    select funding_status::text from public.get_project(:'project_id'::uuid)
  ),
  'not_open',
  'funding not open until publish'
);

select lives_ok(
  format('select public.open_project_funding(%L::uuid)', :'project_id'),
  'open funding'
);

select pg_temp.act_as('a2222222-2222-2222-2222-222222222222') as _ \gset
select throws_ok(
  format(
    'select public.contribute_to_project(%L::uuid, 2000, %L)',
    :'project_id',
    'uninvited-contrib'
  ),
  '55000',
  null,
  'invite-only blocks uninvited contributor'
);

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    'select public.invite_project_contributor(%L::uuid, %L::uuid)',
    :'project_id',
    'a2222222-2222-2222-2222-222222222222'
  ),
  'creator invites contributor'
);

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'a2222222-2222-2222-2222-222222222222'::uuid,
    3000000,
    'proj-contrib-a',
    'proj-seed-a'
  )$$,
  'seed contributor wallet'
);

select pg_temp.act_as('a2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format(
    'select public.contribute_to_project(%L::uuid, 3000, %L)',
    :'project_id',
    'contrib-a-1'
  ),
  'first contribution below target'
);

select is(
  (select funding_status::text from public.get_project(:'project_id'::uuid)),
  'open',
  'still open before minimum target'
);

select lives_ok(
  format(
    'select public.contribute_to_project(%L::uuid, 3000, %L)',
    :'project_id',
    'contrib-a-2'
  ),
  'contribution reaches minimum target'
);

select ok(
  (
    select funding_status::text = 'target_met'
       and min_target_reached_at is not null
    from public.get_project(:'project_id'::uuid)
  ),
  'minimum funding target reached'
);

select lives_ok(
  format('select public.assert_project_assignments_allowed(%L::uuid)', :'project_id'),
  'assignments allowed after target met'
);

select throws_ok(
  format(
    'select public.contribute_to_project(%L::uuid, 5000, %L)',
    :'project_id',
    'overfund-attempt'
  ),
  '55000',
  null,
  'overfunding rejected'
);

select throws_ok(
  format(
    'select public.contribute_to_project(%L::uuid, 500, %L)',
    :'project_id',
    'under-min'
  ),
  '55000',
  null,
  'below minimum contribution rejected'
);

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'a3333333-3333-3333-3333-333333333333'::uuid,
    5000000,
    'proj-contrib-b',
    'proj-seed-b'
  )$$,
  'seed second contributor wallet'
);

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    'select public.invite_project_contributor(%L::uuid, %L::uuid)',
    :'project_id',
    'a3333333-3333-3333-3333-333333333333'
  ),
  'invite second contributor'
);

select pg_temp.act_as('a3333333-3333-3333-3333-333333333333') as _ \gset
select lives_ok(
  format(
    'select public.contribute_to_project(%L::uuid, 4000, %L)',
    :'project_id',
    'contrib-b-final'
  ),
  'second contributor fills remaining budget'
);

select ok(
  (
    select funding_status::text = 'fully_funded'
       and fully_funded_at is not null
    from public.get_project(:'project_id'::uuid)
  ),
  'fully funded when budget is filled'
);

select throws_ok(
  format(
    'select public.contribute_to_project(%L::uuid, 1000, %L)',
    :'project_id',
    'after-full'
  ),
  '55000',
  null,
  'contributions blocked when fully funded'
);

-- Serial pool locking prevents over-allocation between contributors
select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select public.create_project(
  'Race pool',
  null,
  null,
  '{}'::uuid[],
  'public'::public.project_funding_visibility,
  5000,
  3000,
  1000,
  (current_date + 3),
  null,
  'Africa/Lagos'
) as race_project_id \gset

select lives_ok(
  format('select public.open_project_funding(%L::uuid)', :'race_project_id'),
  'open race project'
);

select pg_temp.act_as('a2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format(
    'select public.contribute_to_project(%L::uuid, 3000, %L)',
    :'race_project_id',
    'race-a'
  ),
  'first race contribution'
);

select pg_temp.act_as('a3333333-3333-3333-3333-333333333333') as _ \gset
select throws_ok(
  format(
    'select public.contribute_to_project(%L::uuid, 3000, %L)',
    :'race_project_id',
    'race-b-over'
  ),
  '55000',
  null,
  'second contribution rejected when pool remainder is smaller'
);

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    'select public.decrease_project_budget(%L::uuid, 4500)',
    :'race_project_id'
  ),
  'creator may reduce budget above contributed total'
);

select pg_temp.act_as_owner() as _ \gset
update public.project_funding_pools
set committed_compensation_kobo = 400000
where project_id = :'race_project_id'::uuid;

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format(
    'select public.decrease_project_budget(%L::uuid, 3000)',
    :'race_project_id'
  ),
  '55000',
  null,
  'budget cannot drop below committed compensation'
);

-- Lazy unsuccessful funding -------------------------------------------------------------

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset
select public.create_project(
  'Fail funding',
  null,
  null,
  '{}'::uuid[],
  'public'::public.project_funding_visibility,
  20000,
  15000,
  1000,
  (current_date + 1),
  null,
  'Africa/Lagos'
) as fail_project_id \gset

select lives_ok(
  format('select public.open_project_funding(%L::uuid)', :'fail_project_id'),
  'open fail project'
);

select pg_temp.act_as('a2222222-2222-2222-2222-222222222222') as _ \gset
select public.contribute_to_project(
  :'fail_project_id'::uuid,
  2000,
  'fail-partial'
) as fail_contribution_id \gset

select pg_temp.act_as_owner() as _ \gset
update public.projects
set funding_deadline_at = now() - interval '1 minute'
where id = :'fail_project_id'::uuid;

select pg_temp.act_as('a2222222-2222-2222-2222-222222222222') as _ \gset

select lives_ok(
  format('select public.get_project(%L::uuid)', :'fail_project_id'),
  'lazy eval on get_project'
);

select pg_temp.act_as('a1111111-1111-1111-1111-111111111111') as _ \gset

select ok(
  (
    select funding_status::text = 'unsuccessful'
       and status::text = 'funding_unsuccessful'
    from public.get_project(:'fail_project_id'::uuid)
  ),
  'funding marked unsuccessful after deadline'
);

select throws_ok(
  format(
    'select public.contribute_to_project(%L::uuid, 2000, %L)',
    :'fail_project_id',
    'after-deadline'
  ),
  '55000',
  null,
  'contributions blocked after unsuccessful transition'
);

select throws_ok(
  format('select public.assert_project_assignments_allowed(%L::uuid)', :'fail_project_id'),
  '55000',
  null,
  'assignments blocked after unsuccessful funding'
);

-- Refund gate UD-19 -----------------------------------------------------------------------

select pg_temp.act_as('a2222222-2222-2222-2222-222222222222') as _ \gset

select throws_ok(
  format(
    'select public.claim_project_contribution_refund(%L::uuid)',
    :'fail_contribution_id'
  ),
  'P0001',
  null,
  'refund RPC blocked until UD-19'
);

select * from finish();

rollback;