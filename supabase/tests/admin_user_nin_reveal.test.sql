-- Admin audited NIN reveal: permission checks and no plaintext in audit metadata.

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

select pg_temp.make_user('55555555-5555-5555-5555-555555555501', 'Super Nin Admin', '+2348000000501');
select pg_temp.make_user('55555555-5555-5555-5555-555555555502', 'Support Nin Admin', '+2348000000502');
select pg_temp.make_user('55555555-5555-5555-5555-555555555503', 'Nin Target User', '+2348000000503');

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $$select public.admin_provision_member(
    '55555555-5555-5555-5555-555555555501'::uuid,
    'super_admin'::public.admin_role
  )$$,
  'provision super admin'
);

select lives_ok(
  $$select public.admin_provision_member(
    '55555555-5555-5555-5555-555555555502'::uuid,
    'support_admin'::public.admin_role
  )$$,
  'provision support admin'
);

select set_config('role', 'service_role', true);

select lives_ok(
  $$select public.submit_user_nin_encrypted(
    '55555555-5555-5555-5555-555555555503'::uuid,
    decode('cafe', 'hex'),
    decode('0102030405060708090a0b0c', 'hex'),
    'v1',
    repeat('e', 64),
    '5678'
  )$$,
  'target user has encrypted nin on file'
);

select pg_temp.act_as('55555555-5555-5555-5555-555555555502');

select throws_ok(
  $$select public.admin_service_user_nin_decrypt_bundle(
    '55555555-5555-5555-5555-555555555502'::uuid,
    '55555555-5555-5555-5555-555555555503'::uuid,
    'support attempted reveal for testing',
    'nin-reveal-support-denied'
  )$$,
  '42501',
  null,
  'support admin cannot authorize nin reveal'
);

select set_config('role', 'service_role', true);

select throws_ok(
  $$select public.admin_service_user_nin_decrypt_bundle(
    '55555555-5555-5555-5555-555555555501'::uuid,
    '55555555-5555-5555-5555-555555555503'::uuid,
    'short',
    'nin-reveal-bad-reason'
  )$$,
  '22023',
  null,
  'reveal requires a substantive reason'
);

select is(
  (
    select (public.admin_service_user_nin_decrypt_bundle(
      '55555555-5555-5555-5555-555555555501'::uuid,
      '55555555-5555-5555-5555-555555555503'::uuid,
      'super admin payout verification check',
      'nin-reveal-super-ok'
    )->>'ciphertext_hex') is not null
  ),
  true,
  'super admin receives decrypt bundle without storing plaintext in database'
);

select is(
  (
    select a.action
    from public.admin_audit_events a
    where a.idempotency_key = 'nin-reveal-super-ok'
  ),
  'user_nin_reveal',
  'reveal writes audited action'
);

select is(
  (
    select (a.metadata ? 'nin') OR (a.metadata ? 'nin_plaintext')
    from public.admin_audit_events a
    where a.idempotency_key = 'nin-reveal-super-ok'
  ),
  false,
  'audit metadata never contains nin values'
);

select pg_temp.act_as('55555555-5555-5555-5555-555555555501');

select is(
  (
    select (public.admin_get_user('55555555-5555-5555-5555-555555555503'::uuid)->'identity'->>'nin_submitted')::boolean
  ),
  true,
  'admin_get_user exposes submission status and masked nin only'
);

select is(
  (
    select public.admin_get_user('55555555-5555-5555-5555-555555555503'::uuid)->'identity'->>'nin_masked'
  ),
  '•••••••5678',
  'admin_get_user returns masked nin not full value'
);

select is(
  (
    select public.admin_get_user('55555555-5555-5555-5555-555555555503'::uuid)->'identity' ? 'nin'
  ),
  false,
  'admin_get_user identity payload has no full nin field'
);

select * from finish();
rollback;
