-- Admin project oversight, premium override, reputation authorization.

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

select pg_temp.make_user('11111111-1111-1111-1111-111111111102', 'Super User', '+2348000001002');
select pg_temp.make_user('22222222-2222-2222-2222-222222222222', 'Support User', '+2348000001003');
select pg_temp.make_user('f1111111-1111-1111-1111-111111111111', 'Creator', '+2348000009001');

insert into public.admin_members (user_id, role)
values ('11111111-1111-1111-1111-111111111102', 'super_admin')
on conflict (user_id) do update set role = excluded.role;

insert into public.admin_members (user_id, role)
values ('22222222-2222-2222-2222-222222222222', 'support_admin')
on conflict (user_id) do update set role = excluded.role;

select pg_temp.act_as('11111111-1111-1111-1111-111111111102');

select ok(
  jsonb_typeof(public.admin_list_projects('', 'all', 10, 0)->'items') = 'array',
  'super admin lists projects'
);

select lives_ok(
  $$select public.admin_override_premium_trial(
    'f1111111-1111-1111-1111-111111111111'::uuid,
    now() + interval '60 days',
    'support trial extension for qa',
    'trial-extend-test-1'
  )$$,
  'premium trial override audited'
);

select lives_ok(
  $$select public.admin_apply_reputation_delta(
    'f1111111-1111-1111-1111-111111111111'::uuid,
    5,
    0,
    'manual qa adjustment'
  )$$,
  'super admin reputation delta'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select throws_ok(
  $$select public.admin_apply_reputation_delta(
    'f1111111-1111-1111-1111-111111111111'::uuid,
    1,
    0,
    'support may not adjust'
  )$$,
  '42501',
  null,
  'support admin blocked from crown adjust'
);

select throws_ok(
  $$select public.admin_override_premium_trial(
    'f1111111-1111-1111-1111-111111111111'::uuid,
    now() + interval '30 days',
    'support cannot extend premium',
    'trial-extend-test-2'
  )$$,
  '42501',
  null,
  'support admin blocked from premium override'
);

select pg_temp.act_as('f1111111-1111-1111-1111-111111111111');
select lives_ok($$select public.set_username('creator_handle')$$, 'set username for moderation test');

select pg_temp.act_as('11111111-1111-1111-1111-111111111102');
select lives_ok(
  $$select public.admin_clear_username(
    'f1111111-1111-1111-1111-111111111111'::uuid,
    'policy violation on handle',
    'clear-username-1'
  )$$,
  'admin clears username with audit'
);

select * from finish();

rollback;