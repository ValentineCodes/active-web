-- rate_project_assignment on completed assignments

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

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

select pg_temp.make_user('e1111111-1111-1111-1111-111111111111', 'Rate Creator', '+2348000009101') as _ \gset
select pg_temp.make_user('e2222222-2222-2222-2222-222222222222', 'Rate Worker', '+2348000009102') as _ \gset

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'premium');

select public.create_project(
  'Rating project',
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
    'rate-seed',
    'rate-seed-ref'
  )$$,
  'seed wallet'
);

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.contribute_to_project(%L::uuid, 8000, %L)', :'project_id', 'rate-fund'),
  'fund pool'
);

select public.create_project_assignment(
  :'project_id'::uuid,
  'e2222222-2222-2222-2222-222222222222'::uuid,
  'Work',
  'Scope',
  'Files',
  'single'::public.payment_structure,
  5000,
  now() + interval '7 days'
) as assignment_id \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  format(
    $$update public.project_assignments
      set status = 'completed'::public.project_assignment_status,
          completed_at = now()
      where id = %L::uuid$$,
    :'assignment_id'
  ),
  'mark completed'
);

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    $$select public.rate_project_assignment(%L::uuid, 5::smallint, 'Great work')$$,
    :'assignment_id'
  ),
  'creator rates worker'
);

select is(
  (select viewer_has_rated from public.get_project_assignment(:'assignment_id'::uuid)),
  true,
  'creator marked as rated'
);

select pg_temp.act_as('e2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format(
    $$select public.rate_project_assignment(%L::uuid, 4::smallint, null)$$,
    :'assignment_id'
  ),
  'worker rates creator'
);

select is(
  (select count(*)::int from public.ratings where project_assignment_id = :'assignment_id'::uuid),
  2,
  'two assignment ratings stored'
);

select * from finish();
rollback;