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
  update public.profiles set display_name = p_name where id = p_id;
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

select pg_temp.make_user('11111111-1111-1111-1111-111111111111', 'Finance', '+2348000000501');

select set_config('role', 'postgres', true);
select lives_ok(
  $$select public.admin_provision_member(
    '11111111-1111-1111-1111-111111111111'::uuid,
    'finance_admin'::public.admin_role
  )$$,
  'provision finance admin for dashboard test'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select ok(
  (public.admin_get_withdrawals_overview()->'metrics'->>'pending_count') IS NOT NULL,
  'overview returns pending_count'
);

select ok(
  (public.admin_list_withdrawals()->>'total') IS NOT NULL,
  'list withdrawals with defaults'
);

select pg_temp.make_user('22222222-2222-2222-2222-222222222222', 'Nobody', '+2348000000502');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select throws_ok(
  $$select public.admin_get_withdrawals_overview()$$,
  '42501',
  null,
  'non-admin cannot read overview'
);

select finish();

rollback;
