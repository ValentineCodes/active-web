-- Five open-project cap on create_project (parity with open requests).

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

select pg_temp.make_user('b1111111-1111-1111-1111-111111111111', 'Cap Creator', '+2348000005101') as _ \gset
select pg_temp.act_as('b1111111-1111-1111-1111-111111111111') as _ \gset

select lives_ok($$select public.start_premium_trial()$$, 'premium for cap test creator');

do $body$
declare
  i integer;
begin
  for i in 1..5 loop
    perform public.create_project(
      format('Cap project %s', i),
      'Open cap fixture.',
      null,
      '{}'::uuid[],
      'public'::public.project_funding_visibility,
      10000,
      5000,
      1000,
      (current_date + 7),
      null,
      'Africa/Lagos', 6.5244, 3.3792, 'Lagos, Nigeria'
    );
  end loop;
end;
$body$;

select is(
  (select count(*)::int from public.list_my_created_projects(50, 0)),
  5,
  'creator has five open projects before cap'
);

select throws_ok(
  $$select public.create_project(
    'Sixth project',
  null,
  null,
  '{}'::uuid[],
  'public'::public.project_funding_visibility,
  10000,
  5000,
  1000,
  (current_date + 7),
  null,
  'Africa/Lagos', 6.5244, 3.3792, 'Lagos, Nigeria'
  )$$,
  '55000',
  'you already have 5 open projects',
  'sixth open project is rejected'
);

select * from finish();

rollback;