-- Admin finance directory access control.

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

select pg_temp.make_user('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Finance Admin', '+2348000000906');

select pg_temp.act_as('ffffffff-ffff-ffff-ffff-ffffffffffff');

select throws_ok(
  $$select public.admin_list_transactions()$$,
  '42501',
  null,
  'non-admin cannot list transactions'
);

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $$select public.admin_provision_member(
    'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,
    'finance_admin'::public.admin_role
  )$$,
  'provision finance admin'
);

select pg_temp.act_as('ffffffff-ffff-ffff-ffff-ffffffffffff');

select ok(
  (public.admin_list_transactions()->>'total') IS NOT NULL,
  'finance admin can list ledger'
);

select ok(
  (public.admin_list_wallets()->>'total') IS NOT NULL,
  'finance admin can list wallets'
);

select ok(
  jsonb_array_length(public.admin_financial_exceptions()->'items') >= 0,
  'finance admin can load reconciliation diagnostics'
);

select * from finish();

rollback;
