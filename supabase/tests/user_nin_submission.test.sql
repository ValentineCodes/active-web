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

select pg_temp.make_user('33333333-3333-3333-3333-333333333301', 'Nin User A', '+2348000000801');
select pg_temp.make_user('33333333-3333-3333-3333-333333333302', 'Nin User B', '+2348000000802');

select is(
  (select (public.get_my_identity_status()->>'nin_submitted')::boolean
   from (select pg_temp.act_as('33333333-3333-3333-3333-333333333301')) s),
  false,
  'new user has not submitted nin'
);

select set_config('role', 'service_role', true);

select lives_ok(
  $$
    select public.submit_user_nin_encrypted(
      '33333333-3333-3333-3333-333333333301'::uuid,
      decode('cafe', 'hex'),
      decode('0102030405060708090a0b0c', 'hex'),
      'v1',
      repeat('a', 64),
      '1234'
    );
  $$,
  'service role can store encrypted nin'
);

select is(
  public.user_marketplace_identity_verified('33333333-3333-3333-3333-333333333301'::uuid),
  true,
  'nin submission marks marketplace identity verified'
);

select is(
  (select (public.get_my_identity_status()->>'identity_verified')::boolean
   from (select pg_temp.act_as('33333333-3333-3333-3333-333333333301')) s),
  true,
  'get_my_identity_status reflects verification'
);

select is(
  (select public.get_my_identity_status()->>'nin_masked'
   from (select pg_temp.act_as('33333333-3333-3333-3333-333333333301')) s),
  '•••••••1234',
  'get_my_identity_status returns masked nin only'
);

select set_config('role', 'service_role', true);

select throws_ok(
  $$
    select public.submit_user_nin_encrypted(
      '33333333-3333-3333-3333-333333333301'::uuid,
      decode('babe', 'hex'),
      decode('0102030405060708090a0b0c', 'hex'),
      'v1',
      repeat('b', 64),
      '5678'
    );
  $$,
  '55000',
  'nin already submitted for this account',
  'cannot replace nin without authorized update flow'
);

select is(
  (
    select (public.submit_user_nin_encrypted(
      '33333333-3333-3333-3333-333333333301'::uuid,
      decode('cafe', 'hex'),
      decode('0102030405060708090a0b0c', 'hex'),
      'v1',
      repeat('a', 64),
      '1234'
    )->>'status')
  ),
  'already_submitted',
  'retry with same fingerprint is idempotent'
);

select throws_ok(
  $$
    select public.submit_user_nin_encrypted(
      '33333333-3333-3333-3333-333333333302'::uuid,
      decode('dead', 'hex'),
      decode('0102030405060708090a0b0c', 'hex'),
      'v1',
      repeat('a', 64),
      '1234'
    );
  $$,
  '55000',
  'nin is already linked to another account',
  'fingerprint is globally unique'
);

select throws_ok(
  $$
    select public.submit_user_nin_encrypted(
      '33333333-3333-3333-3333-333333333302'::uuid,
      decode('beef', 'hex'),
      decode('0102030405060708090a0b0c', 'hex'),
      'v1',
      'not-a-valid-fingerprint',
      '1234'
    );
  $$,
  '22023',
  'invalid nin fingerprint',
  'fingerprint must be 64 hex chars'
);

select set_config('role', 'postgres', true);

select is(
  has_function_privilege(
    'authenticated',
    'public.submit_user_nin_encrypted(uuid,bytea,bytea,text,text,text)',
    'EXECUTE'
  ),
  false,
  'authenticated role cannot execute submit_user_nin_encrypted'
);

select * from finish();
rollback;
