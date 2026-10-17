-- Admin access control and marketplace restriction scope.

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

select pg_temp.make_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin User', '+2348000000901');
select pg_temp.make_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Member User', '+2348000000902');

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select throws_ok(
  $$select public.admin_list_users()$$,
  '42501',
  null,
  'non-admin cannot list users'
);

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

select throws_ok(
  $$select public.admin_suspend_user(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'testing suspension reason text',
    'test-suspend-1'
  )$$,
  '42501',
  null,
  'non-admin cannot suspend users'
);

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $$select public.admin_provision_member(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'support_admin'::public.admin_role
  )$$,
  'provision support admin for tests'
);

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select lives_ok(
  $$select public.admin_suspend_user(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'policy violation on marketplace',
    'test-suspend-2'
  )$$,
  'support admin can suspend with reason'
);

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

select throws_ok(
  $$select public.create_request(
    'Need electrician',
    'Ceiling fan installation work needed today',
    6.5,
    3.4,
    'Yaba, Lagos',
    now() + interval '1 day',
    5000,
    null,
    null,
    '{}'::uuid[]
  )$$,
  '42501',
  null,
  'suspended user cannot create a new request'
);

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select lives_ok(
  $$select public.admin_reinstate_user(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'reinstated after review completed',
    'test-reinstate-1'
  )$$,
  'support admin can reinstate user'
);

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $$select public.wallet_record_deposit(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
    5000000,
    'test-seed-member-wallet',
    'test'
  )$$,
  'fund member wallet for create_request test'
);

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

select lives_ok(
  $$select public.create_request(
    'Need plumber',
    'Kitchen sink leak needs fixing today',
    6.5,
    3.4,
    'Yaba, Lagos',
    now() + interval '1 day',
    4500,
    null,
    null,
    '{}'::uuid[]
  )$$,
  'reinstated user can create requests again'
);

select finish();

rollback;
