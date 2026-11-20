-- Project assignments, reservations, independent commencement, payouts

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

select pg_temp.make_user('c1111111-1111-1111-1111-111111111111', 'Assign Creator', '+2348000006001') as _ \gset
select pg_temp.make_user('c2222222-2222-2222-2222-222222222222', 'Worker One', '+2348000006002') as _ \gset
select pg_temp.make_user('c3333333-3333-3333-3333-333333333333', 'Worker Two', '+2348000006003') as _ \gset

select pg_temp.act_as('c1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'premium');

select public.create_project(
  'Multi-worker build',
  'Assignments test',
  null,
  '{}'::uuid[],
  'public'::public.project_funding_visibility,
  20000,
  10000,
  1000,
  (current_date + 10),
  null,
  'Africa/Lagos'
) as project_id \gset

select lives_ok(
  format('select public.open_project_funding(%L::uuid)', :'project_id'),
  'open funding'
);

select pg_temp.act_as('c1111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format(
    $$select public.create_project_assignment(
      %L::uuid,
      %L::uuid,
      'Design',
      'UI scope',
      'Figma screens',
      'single'::public.payment_structure,
      5000,
      now() + interval '14 days'
    )$$,
    :'project_id',
    'c2222222-2222-2222-2222-222222222222'
  ),
  '55000',
  null,
  'assignment blocked before minimum funding target'
);

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'c1111111-1111-1111-1111-111111111111'::uuid,
    20000000,
    'contrib-pool',
    'contrib-pool-ref'
  )$$,
  'seed creator wallet'
);

select pg_temp.act_as('c1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    'select public.contribute_to_project(%L::uuid, 12000, %L)',
    :'project_id',
    'assign-pool-contrib'
  ),
  'reach minimum funding target'
);

select public.create_project_assignment(
  :'project_id'::uuid,
  'c2222222-2222-2222-2222-222222222222'::uuid,
  'Design',
  'UI scope',
  'Figma screens',
  'single'::public.payment_structure,
  4000,
  now() + interval '14 days'
) as assignment_one_id \gset

select public.create_project_assignment(
  :'project_id'::uuid,
  'c3333333-3333-3333-3333-333333333333'::uuid,
  'Backend',
  'API scope',
  'OpenAPI spec',
  'single'::public.payment_structure,
  3000,
  now() + interval '21 days'
) as assignment_two_id \gset

select pg_temp.act_as('c2222222-2222-2222-2222-222222222222') as _ \gset
select throws_ok(
  format('select public.reserve_project_assignment_compensation(%L::uuid)', :'assignment_one_id'),
  'P0002',
  null,
  'worker cannot reserve compensation'
);

select lives_ok(
  format('select public.accept_project_assignment(%L::uuid)', :'assignment_one_id'),
  'worker one accepts'
);

select pg_temp.act_as('c3333333-3333-3333-3333-333333333333') as _ \gset
select lives_ok(
  format('select public.accept_project_assignment(%L::uuid)', :'assignment_two_id'),
  'worker two accepts'
);

select pg_temp.act_as('c1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    $$select public.propose_project_assignment_terms(
      %L::uuid,
      'Design v2',
      'Expanded UI',
      'Extra screens',
      'single'::public.payment_structure,
      3500,
      now() + interval '20 days'
    )$$,
    :'assignment_one_id'
  ),
  'propose new terms before reserve'
);

select pg_temp.act_as('c2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select public.accept_project_assignment(%L::uuid)', :'assignment_one_id'),
  'worker agrees to revised terms'
);

select pg_temp.act_as('c1111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select compensation_total_kobo from public.get_project_assignment(:'assignment_one_id'::uuid)),
  350000::bigint,
  'compensation updated after mutual terms agreement'
);

select public.reserve_project_assignment_compensation(:'assignment_one_id'::uuid) as pool_res_one \gset

select is(
  public.reserve_project_assignment_compensation(:'assignment_one_id'::uuid),
  :'pool_res_one'::uuid,
  'reserve idempotent'
);

select pg_temp.act_as('c2222222-2222-2222-2222-222222222222') as _ \gset
select throws_ok(
  format('select public.start_project_assignment(%L::uuid)', :'assignment_two_id'),
  'P0002',
  null,
  'worker one cannot start worker two assignment'
);

select pg_temp.act_as('c3333333-3333-3333-3333-333333333333') as _ \gset
select throws_ok(
  format('select public.start_project_assignment(%L::uuid)', :'assignment_two_id'),
  '55000',
  null,
  'start blocked when compensation not secured'
);

select pg_temp.act_as('c1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.release_project_assignment_reservation(%L::uuid)', :'assignment_two_id'),
  'release is no-op when nothing reserved'
);

select public.reserve_project_assignment_compensation(:'assignment_two_id'::uuid) as pool_res_two \gset

select lives_ok(
  format('select public.release_project_assignment_reservation(%L::uuid)', :'assignment_two_id'),
  'release assignment reservation before commence'
);

select pg_temp.act_as('c2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select public.start_project_assignment(%L::uuid)', :'assignment_one_id'),
  'worker one commences independently'
);

select pg_temp.act_as('c1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.reserve_project_assignment_compensation(%L::uuid)', :'assignment_two_id'),
  're-reserve after release'
);

select pg_temp.act_as('c3333333-3333-3333-3333-333333333333') as _ \gset
select lives_ok(
  format('select public.start_project_assignment(%L::uuid)', :'assignment_two_id'),
  'worker two commences without waiting for worker one'
);

select pg_temp.act_as('c1111111-1111-1111-1111-111111111111') as _ \gset
select public.create_project_assignment(
  :'project_id'::uuid,
  'c3333333-3333-3333-3333-333333333333'::uuid,
  'Tiny',
  null,
  null,
  'single'::public.payment_structure,
  9000,
  now() + interval '7 days'
) as tiny_assignment_id \gset

select pg_temp.act_as('c3333333-3333-3333-3333-333333333333') as _ \gset
select lives_ok(
  format('select public.accept_project_assignment(%L::uuid)', :'tiny_assignment_id'),
  'accept tiny assignment'
);

select pg_temp.act_as('c1111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select public.reserve_project_assignment_compensation(%L::uuid)', :'tiny_assignment_id'),
  '55000',
  null,
  'insufficient unreserved pool blocks reserve'
);

select pg_temp.act_as('c2222222-2222-2222-2222-222222222222') as _ \gset
select public.submit_project_assignment_work(:'assignment_one_id'::uuid, null, 'Drafts attached') as _ \gset

select pg_temp.act_as('c1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    'select public.approve_and_payout_project_assignment(%L::uuid, null, %L)',
    :'assignment_one_id',
    'payout-a-1'
  ),
  'payout approved work'
);

select is(
  (select status::text from public.get_project_assignment(:'assignment_one_id'::uuid)),
  'completed',
  'single-pay assignment completes after payout'
);

select lives_ok(
  format(
    'select public.approve_and_payout_project_assignment(%L::uuid, null, %L)',
    :'assignment_one_id',
    'payout-a-1'
  ),
  'payout idempotent'
);

-- UD-20 interim: early commencement disabled requires full budget
select public.create_project(
  'Full budget gate',
  null,
  null,
  '{}'::uuid[],
  'public'::public.project_funding_visibility,
  10000,
  5000,
  1000,
  (current_date + 5),
  null,
  'Africa/Lagos'
) as ud20_project_id \gset

select lives_ok(
  format('select public.open_project_funding(%L::uuid)', :'ud20_project_id'),
  'open ud20 project'
);

select lives_ok(
  format('select public.contribute_to_project(%L::uuid, 6000, %L)', :'ud20_project_id', 'ud20-partial'),
  'partial fund'
);

select pg_temp.act_as_owner() as _ \gset
update public.projects
set early_commencement_enabled = false
where id = :'ud20_project_id'::uuid;

select pg_temp.act_as('c1111111-1111-1111-1111-111111111111') as _ \gset
select public.create_project_assignment(
  :'ud20_project_id'::uuid,
  'c2222222-2222-2222-2222-222222222222'::uuid,
  'UD20 task',
  null,
  null,
  'single'::public.payment_structure,
  2000,
  now() + interval '5 days'
) as ud20_assignment_id \gset

select pg_temp.act_as('c2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select public.accept_project_assignment(%L::uuid)', :'ud20_assignment_id'),
  'accept ud20 assignment'
);

select pg_temp.act_as('c1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.reserve_project_assignment_compensation(%L::uuid)', :'ud20_assignment_id'),
  'reserve ud20 assignment'
);

select pg_temp.act_as('c2222222-2222-2222-2222-222222222222') as _ \gset
select throws_ok(
  format('select public.start_project_assignment(%L::uuid)', :'ud20_assignment_id'),
  'P0001',
  null,
  'UD-20 blocks start until full budget funded'
);

select pg_temp.act_as('c1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.contribute_to_project(%L::uuid, 4000, %L)', :'ud20_project_id', 'ud20-full'),
  'fill project budget'
);

select pg_temp.act_as('c2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select public.start_project_assignment(%L::uuid)', :'ud20_assignment_id'),
  'start after full budget when early commencement disabled'
);

select * from finish();

rollback;