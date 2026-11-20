-- Consumer project list/read RPCs

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

select pg_temp.make_user('c1111111-1111-1111-1111-111111111111', 'Creator', '+2348000009001') as _ \gset
select pg_temp.make_user('c2222222-2222-2222-2222-222222222222', 'Stranger', '+2348000009002') as _ \gset

select pg_temp.act_as('c1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'premium');

select public.create_project(
  'Consumer list project',
  'desc',
  null,
  '{}'::uuid[],
  'invite_only'::public.project_funding_visibility,
  10000,
  5000,
  1000,
  (current_date + 10),
  null,
  'Africa/Lagos'
) as project_id \gset

select is(
  (select count(*)::int from public.list_my_created_projects(10, 0)),
  1,
  'creator lists own projects'
);

select pg_temp.act_as('c2222222-2222-2222-2222-222222222222') as _ \gset
select throws_ok(
  format($$select public.get_project(%L::uuid)$$, :'project_id'),
  'P0002',
  null,
  'stranger cannot view invite-only draft/live without invite'
);

select * from finish();
rollback;