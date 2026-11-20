-- Phase 9: username, public profile allowlist, search, premium, reputation foundations

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

select pg_temp.make_user('e1111111-1111-1111-1111-111111111111', 'Phase Nine', '+2348000008001') as _ \gset
select pg_temp.make_user('e2222222-2222-2222-2222-222222222222', 'Other User', '+2348000008002') as _ \gset
select pg_temp.make_user('f3333333-3333-3333-3333-333333333333', 'Super Admin', '+2348000008999') as _ \gset

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok($$select public.set_username('phase9_user')$$, 'set username');
select throws_ok($$select public.set_username('ab')$$, '22023', null, 'username length validation');

select pg_temp.act_as('e2222222-2222-2222-2222-222222222222') as _ \gset
select throws_ok($$select public.set_username('phase9_user')$$, '55000', null, 'username uniqueness');

select pg_temp.act_as_owner() as _ \gset
update public.profiles set phone = '+2349999999999' where id = 'e2222222-2222-2222-2222-222222222222'::uuid;

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select ok(
  (
    select user_id = 'e1111111-1111-1111-1111-111111111111'::uuid
    from public.get_public_profile('phase9_user')
  ),
  'public profile resolved by username without widening RLS'
);

select ok(
  (
    select display_name = 'Phase Nine'
       and username = 'phase9_user'
    from public.get_public_profile('phase9_user')
  ),
  'public profile allowlist fields'
);

select lives_ok(
  $$select count(*) from public.search_people('phase9', 10, 0)$$,
  'people search'
);

select lives_ok($$select public.get_my_entitlements()$$, 'entitlements read');
select is(
  (select premium_active from public.get_my_entitlements()),
  false,
  'trial not started yet'
);

select throws_ok($$select public.create_project(
  'Blocked',
  null,
  null,
  '{}'::uuid[],
  'public'::public.project_funding_visibility,
  10000,
  5000,
  1000,
  (current_date + 7),
  null,
  'Africa/Lagos'
)$$, '55000', null, 'project create requires premium');

select lives_ok($$select public.start_premium_trial()$$, 'start trial');
select ok(
  (select can_create_projects from public.get_my_entitlements()),
  'can create projects during trial'
);

select pg_temp.act_as_owner() as _ \gset
update public.profiles
set premium_trial_ends_at = now() - interval '1 day'
where id = 'e1111111-1111-1111-1111-111111111111'::uuid;

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select ok(
  NOT (select can_create_projects from public.get_my_entitlements()),
  'cannot create projects after trial expiry'
);

select ok(
  (
    select points_main = 0
    from public.get_my_reputation()
  ),
  'reputation baseline'
);

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.admin_provision_member(
    'f3333333-3333-3333-3333-333333333333'::uuid,
    'super_admin'::public.admin_role
  )$$,
  'provision super admin'
);
select pg_temp.act_as('f3333333-3333-3333-3333-333333333333') as _ \gset
select lives_ok(
  $$select public.admin_apply_reputation_delta(
    'e1111111-1111-1111-1111-111111111111'::uuid,
    5,
    0,
    'test adjustment'
  )$$,
  'admin reputation delta'
);

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select points_main from public.get_my_reputation()),
  5,
  'ledger applied points'
);

select ok(
  (select count(*) = 1 from public.list_my_reputation_history(10, 0)),
  'reputation history append-only read'
);

select lives_ok(
  $$select public.set_my_crown_public(false)$$,
  'hide crown'
);

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.admin_provision_member(
    'e2222222-2222-2222-2222-222222222222'::uuid,
    'support_admin'::public.admin_role
  )$$,
  'provision support admin for crown privacy check'
);
select pg_temp.act_as('e2222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select crown_tier from public.get_public_profile('phase9_user')),
  'hidden',
  'crown hidden from others'
);

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select ok(
  (
    select (public.search_discover(
      'top'::public.search_discover_category,
      'phase9',
      null,
      null,
      10,
      0
    ) ->> 'ranking') = 'deferred_ud_11'
  ),
  'top search exposes deferred ranking'
);

select * from finish();

rollback;