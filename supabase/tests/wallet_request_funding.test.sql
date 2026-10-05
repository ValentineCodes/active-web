-- Request posting locks wallet funds atomically; counter-offers reconcile the active lock.

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

create function pg_temp.act_as_owner()
returns text
language plpgsql
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return 'postgres';
end;
$$;

select pg_temp.make_user('88888888-8888-8888-8888-888888888888', 'Fund Requester', '+2348000000888') as _ \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    '88888888-8888-8888-8888-888888888888'::uuid,
    1000000,
    'fund-test-wallet-seed',
    'fund-test'
  )$$,
  'seed wallet with ₦10,000'
);

select pg_temp.act_as('88888888-8888-8888-8888-888888888888') as _ \gset

select create_request(
  'Fix leaking tap',
  'Kitchen tap keeps dripping.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as funded_request_id \gset

select is(
  (
    select available_balance
    from public.wallets
    where user_id = '88888888-8888-8888-8888-888888888888'::uuid
  ),
  450000::bigint,
  'available balance decreases by total charge (₦5,500)'
);

select is(
  (
    select sum(pl.total)::bigint
    from public.payment_locks pl
    join public.requests r on r.id = pl.request_id
    where pl.user_id = '88888888-8888-8888-8888-888888888888'::uuid
      and pl.status = 'active'::public.payment_lock_status
      and r.payment_status = 'locked'::public.payment_status
  ),
  550000::bigint,
  'locked amount matches offer plus service fee'
);

select is(
  (
    select payment_status::text
    from public.requests
    where id = :'funded_request_id'::uuid
  ),
  'locked',
  'request is funded for discovery'
);

select is(
  (
    select count(*)::int
    from public.wallet_transactions wt
    where wt.request_id = :'funded_request_id'::uuid
      and wt.type = 'escrow_lock'::public.wallet_transaction_type
  ),
  1,
  'one escrow lock wallet transaction is created'
);

select lives_ok(
  format(
    'select public.lock_request_escrow(%L::uuid, %L)',
    :'funded_request_id',
    'create:' || :'funded_request_id'
  ),
  'repeated lock_request_escrow is idempotent'
);

select is(
  (
    select count(*)::int
    from public.wallet_transactions wt
    where wt.request_id = :'funded_request_id'::uuid
      and wt.type = 'escrow_lock'::public.wallet_transaction_type
  ),
  1,
  'idempotent lock does not double-credit or double-lock'
);

select lives_ok(
  format(
    'select public.align_request_escrow_to_agreed_amount(%L::uuid, %s, %L)',
    :'funded_request_id',
    6000,
    'counter-offer-test'
  ),
  'counter-offer increases lock when extra funds are available'
);

select is(
  (
    select pl.total
    from public.payment_locks pl
    where pl.request_id = :'funded_request_id'::uuid
  ),
  public.ngn_major_to_kobo(6600),
  'lock total updates to new offer plus fee (₦6,600)'
);

select is(
  (
    select available_balance
    from public.wallets
    where user_id = '88888888-8888-8888-8888-888888888888'::uuid
  ),
  340000::bigint,
  'available balance reflects additional ₦1,100 held'
);

select throws_ok(
  format(
    'select public.align_request_escrow_to_agreed_amount(%L::uuid, %s, %L)',
    :'funded_request_id',
    50000,
    'counter-offer-too-large'
  ),
  '55000',
  'insufficient wallet balance to accept this offer',
  'counter-offer fails when extra funds are not available'
);

select * from finish();

rollback;
