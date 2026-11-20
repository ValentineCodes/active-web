-- Premium expiry: existing project access vs new create

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

select pg_temp.make_user('f1111111-1111-1111-1111-111111111111', 'Expiry Creator', '+2348000007101') as _ \gset

select pg_temp.act_as('f1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'start trial');

select public.create_project(
  'Survives expiry',
  null,
  null,
  '{}'::uuid[],
  'public'::public.project_funding_visibility,
  10000,
  5000,
  1000,
  (current_date + 14),
  null,
  'Africa/Lagos', 6.5244, 3.3792, 'Lagos, Nigeria'
) as project_id \gset

select pg_temp.act_as_owner() as _ \gset
update public.profiles
set premium_trial_ends_at = now() - interval '1 day'
where id = 'f1111111-1111-1111-1111-111111111111'::uuid;

select pg_temp.act_as('f1111111-1111-1111-1111-111111111111') as _ \gset

select ok(
  NOT (select can_create_projects from public.get_my_entitlements()),
  'cannot create after expiry'
);

select throws_ok(
  $$select public.create_project(
    'Blocked after expiry',
    null,
    null,
    '{}'::uuid[],
    'public'::public.project_funding_visibility,
    10000,
    5000,
    1000,
    (current_date + 14),
    null,
    'Africa/Lagos', 6.5244, 3.3792, 'Lagos, Nigeria'
  )$$,
  '55000',
  null,
  'create blocked after expiry'
);

select ok(
  (
    select count(*) = 1
    from public.get_project(:'project_id'::uuid)
  ),
  'existing project still readable after premium expiry'
);

select * from finish();
rollback;