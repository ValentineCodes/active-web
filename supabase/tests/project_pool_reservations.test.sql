-- Pool reservations and contribution accounting (refund RPC remains UD-19 blocked)

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

select pg_temp.make_user('b1111111-1111-1111-1111-111111111111', 'Reserve Creator', '+2348000005001') as _ \gset
select pg_temp.make_user('b2222222-2222-2222-2222-222222222222', 'Reserve Contributor', '+2348000005002') as _ \gset

select pg_temp.act_as('b1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'premium trial');

select public.create_project(
  'Reservation pool',
  null,
  null,
  '{}'::uuid[],
  'public'::public.project_funding_visibility,
  10000,
  5000,
  1000,
  (current_date + 5),
  null,
  'Africa/Lagos', 6.5244, 3.3792, 'Lagos, Nigeria'
) as project_id \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'b2222222-2222-2222-2222-222222222222'::uuid,
    8000000,
    'reserve-seed',
    'reserve-seed-ref'
  )$$,
  'seed wallet'
);

select pg_temp.act_as('b2222222-2222-2222-2222-222222222222') as _ \gset
select public.contribute_to_project(
  :'project_id'::uuid,
  6000,
  'reserve-contrib'
) as contribution_id \gset

select pg_temp.act_as('b1111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format(
    'select public.reserve_project_pool_kobo(%L::uuid, 7000, %L)',
    :'project_id',
    'over-reserve'
  ),
  '55000',
  null,
  'cannot reserve more than unreserved pool'
);

select public.reserve_project_pool_kobo(
  :'project_id'::uuid,
  2000,
  'reserve-a'
) as reservation_id \gset

select is(
  (select reserved_total_kobo from public.get_project(:'project_id'::uuid)),
  200000::bigint,
  'pool reserved total updated'
);

select throws_ok(
  format(
    'select public.reserve_project_pool_kobo(%L::uuid, 5000, %L)',
    :'project_id',
    'over-reserve-2'
  ),
  '55000',
  null,
  'remaining unreserved blocks second over-reserve'
);

select public.reserve_project_pool_kobo(
  :'project_id'::uuid,
  3000,
  'reserve-b'
) as reservation_b_id \gset

select is(
  public.reserve_project_pool_kobo(:'project_id'::uuid, 3000, 'reserve-b'),
  :'reservation_b_id'::uuid,
  'duplicate reserve idempotency'
);

select lives_ok(
  format(
    'select public.release_project_pool_reservation(%L::uuid, %L)',
    :'reservation_id',
    'release-a'
  ),
  'release reservation'
);

select lives_ok(
  format(
    'select public.release_project_pool_reservation(%L::uuid, %L)',
    :'reservation_id',
    'release-a'
  ),
  'release idempotent'
);

select is(
  (select reserved_total_kobo from public.get_project(:'project_id'::uuid)),
  300000::bigint,
  'reserved total decreased after release'
);

select pg_temp.act_as('b2222222-2222-2222-2222-222222222222') as _ \gset
select ok(
  (
    select reservations_attributed = false
       and eligible_refund_kobo is null
       and gross_amount_kobo = 600000
       and reserved_kobo = 0
    from public.get_project_contribution_accounting(:'contribution_id'::uuid)
  ),
  'eligible balance withheld until UD-19 attribution'
);

select throws_ok(
  format(
    'select public.attribute_project_reservation_to_contributions(%L::uuid)',
    :'reservation_b_id'
  ),
  'P0001',
  null,
  'allocation RPC blocked by UD-19'
);

select throws_ok(
  format(
    'select public.claim_project_contribution_refund(%L::uuid)',
    :'contribution_id'
  ),
  'P0001',
  null,
  'refund RPC blocked by UD-19'
);

select * from finish();

rollback;