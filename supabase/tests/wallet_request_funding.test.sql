-- Wallet funds lock on accept, not on post; counter-offers lock the agreed amount at accept.

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
select pg_temp.make_user('77777777-7777-7777-7777-777777777777', 'Fund Helper', '+2348000000777') as _ \gset
select pg_temp.make_user('66666666-6666-6666-6666-666666666666', 'Counter Helper', '+2348000000666') as _ \gset

select pg_temp.act_as('88888888-8888-8888-8888-888888888888') as _ \gset

select create_request(
  'Post without balance',
  'Should not lock at post.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as unfunded_request_id \gset

select is(
  (
    select available_balance
    from public.wallets
    where user_id = '88888888-8888-8888-8888-888888888888'::uuid
  ),
  0::bigint,
  'posting without wallet balance does not change available balance'
);

select is(
  (
    select payment_status::text
    from public.requests
    where id = :'unfunded_request_id'::uuid
  ),
  'not_required',
  'posted request stays unfunded until acceptance'
);

select is(
  (
    select count(*)::int
    from public.wallet_transactions wt
    where wt.request_id = :'unfunded_request_id'::uuid
  ),
  0,
  'posting does not create wallet transactions'
);

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
  'Insufficient accept',
  'Cannot accept without funds.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as broke_request_id \gset

select pg_temp.act_as('77777777-7777-7777-7777-777777777777') as _ \gset

select respond_to_request(
  :'broke_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800
) as broke_response_id \gset

select pg_temp.act_as_owner() as _ \gset

update public.wallets
set available_balance = 0
where user_id = '88888888-8888-8888-8888-888888888888'::uuid;

select pg_temp.act_as('88888888-8888-8888-8888-888888888888') as _ \gset

select throws_ok(
  format('select accept_response(%L::uuid)', :'broke_response_id'),
  '55000',
  'insufficient wallet balance to fund this request',
  'accept fails when wallet cannot cover the agreed amount'
);

select is(
  (select count(*)::int from public.handshakes where request_id = :'broke_request_id'::uuid),
  0,
  'failed accept does not create a handshake'
);

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    '88888888-8888-8888-8888-888888888888'::uuid,
    1000000,
    'fund-test-wallet-reseed',
    'fund-test-2'
  )$$,
  're-seed wallet after insufficient accept test'
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
  1000000::bigint,
  'create does not lock funds from available balance'
);

select is(
  (
    select count(*)::int
    from public.payment_locks pl
    where pl.request_id = :'funded_request_id'::uuid
  ),
  0,
  'no payment lock exists until acceptance'
);

select pg_temp.act_as('77777777-7777-7777-7777-777777777777') as _ \gset

select respond_to_request(
  :'funded_request_id'::uuid,
  'I can fix it.',
  null,
  6.5000,
  3.3800
) as funded_response_id \gset

select pg_temp.act_as('88888888-8888-8888-8888-888888888888') as _ \gset

select lives_ok(
  format('select accept_response(%L::uuid)', :'funded_response_id'),
  'accept locks funds and completes handshake'
);

select is(
  (
    select available_balance
    from public.wallets
    where user_id = '88888888-8888-8888-8888-888888888888'::uuid
  ),
  500000::bigint,
  'available balance decreases by the offer amount (₦5,000) on accept'
);

select is(
  (
    select sum(pl.total)::bigint
    from public.payment_locks pl
    join public.requests r on r.id = pl.request_id
    where pl.request_id = :'funded_request_id'::uuid
      and pl.status = 'active'::public.payment_lock_status
      and r.payment_status = 'pending'::public.payment_status
  ),
  500000::bigint,
  'locked amount matches the offer after accept (fee taken at payout)'
);

select is(
  (
    select count(*)::int
    from public.wallet_transactions wt
    where wt.request_id = :'funded_request_id'::uuid
      and wt.type = 'escrow_lock'::public.wallet_transaction_type
  ),
  1,
  'one escrow lock wallet transaction is created on accept'
);

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    '88888888-8888-8888-8888-888888888888'::uuid,
    500000,
    'fund-test-counter-top-up',
    'fund-test-3'
  )$$,
  'top up for counter-offer accept test'
);

select pg_temp.act_as('88888888-8888-8888-8888-888888888888') as _ \gset

select create_request(
  'Counter offer lock',
  'Higher counter at accept.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as counter_request_id \gset

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset

select respond_to_request(
  :'counter_request_id'::uuid,
  'Need more for parts.',
  6000,
  6.5000,
  3.3800
) as counter_response_id \gset

select pg_temp.act_as('88888888-8888-8888-8888-888888888888') as _ \gset

select lives_ok(
  format('select accept_response(%L::uuid)', :'counter_response_id'),
  'accept locks the agreed counter-offer amount'
);

select is(
  (
    select pl.total
    from public.payment_locks pl
    where pl.request_id = :'counter_request_id'::uuid
  ),
  public.ngn_major_to_kobo(6000),
  'lock total matches counter-offer (₦6,000)'
);

select * from finish();

rollback;
