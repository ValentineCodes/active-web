-- Operational issues, audit access, and member management audits.

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

select pg_temp.make_user('11111111-1111-1111-1111-111111111102', 'Super User', '+2348000001002');
select pg_temp.make_user('22222222-2222-2222-2222-222222222222', 'Support User', '+2348000001003');

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select throws_ok(
  $$select public.admin_list_audit_events()$$,
  '42501',
  null,
  'support admin cannot read audit logs'
);

select throws_ok(
  $$select public.admin_list_members()$$,
  '42501',
  null,
  'support admin cannot list members'
);

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $$select public.admin_provision_member(
    '11111111-1111-1111-1111-111111111102'::uuid,
    'super_admin'::public.admin_role
  )$$,
  'provision super admin'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111102');

select ok(
  jsonb_typeof(public.admin_operational_issues()->'items') = 'array',
  'super admin can load operational issues'
);

select ok(
  (public.admin_list_audit_events()->>'total') IS NOT NULL,
  'super admin can list audit events'
);

select lives_ok(
  $$select public.admin_grant_member(
    '22222222-2222-2222-2222-222222222222'::uuid,
    'support_admin'::public.admin_role
  )$$,
  'super admin can grant support role'
);

select ok(
  (
    select count(*)::int
    from jsonb_array_elements(public.admin_list_audit_events('', 'admin_grant_member', 'admin_member', 10, 0)->'items') item
    where (item->>'entity_id')::uuid = '22222222-2222-2222-2222-222222222222'::uuid
  ) >= 1,
  'grant member writes audit event'
);

select throws_ok(
  $$select public.admin_execute_operational_recovery(
    'auto_complete_request',
    '00000000-0000-0000-0000-000000000099'::uuid,
    'testing invalid recovery path',
    'op-recovery-invalid-1'
  )$$,
  'P0002',
  null,
  'recovery rejects missing request'
);

select * from finish();

rollback;
