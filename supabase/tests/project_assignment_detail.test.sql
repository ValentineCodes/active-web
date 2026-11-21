-- Assignment detail RPC access and payout eligibility flags

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

select pg_temp.make_user('e1111111-1111-1111-1111-111111111111', 'Detail Creator', '+2348000008001') as _ \gset
select pg_temp.make_user('e2222222-2222-2222-2222-222222222222', 'Detail Worker', '+2348000008002') as _ \gset
select pg_temp.make_user('e3333333-3333-3333-3333-333333333333', 'Detail Contributor', '+2348000008003') as _ \gset
select pg_temp.make_user('e4444444-4444-4444-4444-444444444444', 'Detail Stranger', '+2348000008004') as _ \gset

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'premium');

select public.create_project(
  'Detail project',
  null,
  null,
  '{}'::uuid[],
  'public'::public.project_funding_visibility,
  10000,
  5000,
  1000,
  (current_date + 10),
  null,
  'Africa/Lagos', 6.5244, 3.3792, 'Lagos'
) as project_id \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'e1111111-1111-1111-1111-111111111111'::uuid,
    15000000,
    'det-seed',
    'det-seed-ref'
  )$$,
  'seed wallet'
);
select lives_ok(
  $$select public.wallet_record_deposit(
    'e3333333-3333-3333-3333-333333333333'::uuid,
    5000000,
    'det-contrib',
    'det-contrib-ref'
  )$$,
  'contrib wallet'
);

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.contribute_to_project(%L::uuid, 8000, %L)', :'project_id', 'det-fund'),
  'fund pool'
);

select pg_temp.act_as('e3333333-3333-3333-3333-333333333333') as _ \gset
select lives_ok(
  format('select public.contribute_to_project(%L::uuid, 1000, %L)', :'project_id', 'det-contrib-1'),
  'contributor joins pool'
);

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select public.create_project_assignment(
  :'project_id'::uuid,
  'e2222222-2222-2222-2222-222222222222'::uuid,
  'Build feature',
  'Scope',
  'Source + tests',
  'single'::public.payment_structure,
  5000,
  now() + interval '7 days'
) as assignment_id \gset

select pg_temp.act_as('e2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select public.accept_project_assignment(%L::uuid)', :'assignment_id'),
  'worker accepts'
);

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.reserve_project_assignment_compensation(%L::uuid)', :'assignment_id'),
  'reserve'
);

select pg_temp.act_as('e2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select public.start_project_assignment(%L::uuid)', :'assignment_id'),
  'commence'
);

-- Creator can load detail
select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select project_id::text from public.get_project_assignment(:'assignment_id'::uuid)),
  :'project_id',
  'creator loads assignment'
);
select is(
  (select viewer_is_creator from public.get_project_assignment(:'assignment_id'::uuid)),
  true,
  'creator flag'
);

-- Contributor read-only
select pg_temp.act_as('e3333333-3333-3333-3333-333333333333') as _ \gset
select is(
  (select viewer_is_contributor from public.get_project_assignment(:'assignment_id'::uuid)),
  true,
  'contributor flag'
);
select is(
  (select creator_may_release_payment from public.get_project_assignment(:'assignment_id'::uuid)),
  false,
  'contributor cannot release'
);

-- Worker
select pg_temp.act_as('e2222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select viewer_is_worker from public.get_project_assignment(:'assignment_id'::uuid)),
  true,
  'worker flag'
);

-- Stranger denied
select pg_temp.act_as('e4444444-4444-4444-4444-444444444444') as _ \gset
select throws_ok(
  format('select * from public.get_project_assignment(%L::uuid)', :'assignment_id'),
  'P0002',
  null,
  'unrelated user denied'
);

-- Payout eligibility only after submission
select pg_temp.act_as('e2222222-2222-2222-2222-222222222222') as _ \gset
select public.submit_project_assignment_work(:'assignment_id'::uuid, null, 'Done') as _ \gset

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select creator_may_release_payment from public.get_project_assignment(:'assignment_id'::uuid)),
  true,
  'creator may release after submission'
);

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    'select public.approve_and_payout_project_assignment(%L::uuid, null, %L)',
    :'assignment_id',
    'det-payout-1'
  ),
  'release payment'
);

select is(
  (select creator_may_release_payment from public.get_project_assignment(:'assignment_id'::uuid)),
  false,
  'release hidden after payout'
);

select * from finish();
rollback;