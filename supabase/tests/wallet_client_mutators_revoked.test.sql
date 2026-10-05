-- Authenticated clients cannot mutate wallet balances through legacy RPCs.

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

select pg_temp.make_user('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Mutator Test', '+2348000000999') as _ \gset
select pg_temp.act_as('cccccccc-cccc-cccc-cccc-cccccccccccc') as _ \gset

select throws_ok(
  $$select public.wallet_top_up(1000, 'client-top-up')$$,
  '42501',
  'permission denied for function wallet_top_up',
  'authenticated cannot wallet_top_up'
);

select throws_ok(
  $$select public.wallet_withdraw(100, 'client-withdraw')$$,
  '42501',
  'permission denied for function wallet_withdraw',
  'authenticated cannot wallet_withdraw'
);

select * from finish();

rollback;
