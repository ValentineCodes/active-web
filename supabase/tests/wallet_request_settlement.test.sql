-- Wallet release on completion and refund on cancellation.

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

select pg_temp.make_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Settle Requester', '+2348000000101') as _ \gset
select pg_temp.make_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Settle Helper', '+2348000000102') as _ \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    1000000,
    'settle-requester-seed',
    'settle-seed'
  )$$,
  'seed requester with ₦10,000'
);

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select create_request(
  'Paint a room',
  'One bedroom needs painting.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as settle_request_id \gset

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as _ \gset
select respond_to_request(
  :'settle_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800
) as settle_response_id \gset

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select lives_ok(
  format('select accept_response(%L)', :'settle_response_id'),
  'accept helper and move escrow to pending'
);

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as _ \gset
select lives_ok(
  format('select start_request(%L)', :'settle_request_id'),
  'helper starts service'
);
select lives_ok(
  format('select mark_service_complete(%L)', :'settle_request_id'),
  'helper marks completion pending'
);

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select lives_ok(
  format('select complete_request(%L)', :'settle_request_id'),
  'requester confirms completion and releases payment'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (
    select available_balance
    from public.wallets
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
  ),
  500000::bigint,
  'requester available unchanged after release'
);

select is(
  (
    select coalesce(sum(pl.total), 0)::bigint
    from public.payment_locks pl
    where pl.request_id = :'settle_request_id'::uuid
      and pl.status = 'active'::public.payment_lock_status
  ),
  0::bigint,
  'requester has no active locked funds after completion'
);

select is(
  (
    select available_balance
    from public.wallets
    where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid
  ),
  450000::bigint,
  'responder receives 90% of the offer in available balance'
);

select is(
  (
    select status::text
    from public.payment_locks
    where request_id = :'settle_request_id'::uuid
  ),
  'released',
  'payment lock marked released'
);

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select lives_ok(
  format('select complete_request(%L)', :'settle_request_id'),
  'complete_request is idempotent after success'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (
    select available_balance
    from public.wallets
    where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid
  ),
  450000::bigint,
  'repeated completion does not double-pay responder'
);

-- Cancellation before selection (no wallet lock) ------------------------------------

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select create_request(
  'Cancelled job',
  'Will cancel before selection.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  4000
) as cancel_request_id \gset

select is(
  (
    select available_balance
    from public.wallets
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
  ),
  500000::bigint,
  'posted request does not lock funds before acceptance'
);

select lives_ok(
  format('select cancel_request(%L)', :'cancel_request_id'),
  'cancel before selection does not require a wallet refund'
);

select is(
  (
    select available_balance
    from public.wallets
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
  ),
  500000::bigint,
  'cancellation before acceptance leaves available balance unchanged'
);

select is(
  (
    select payment_status::text
    from public.requests
    where id = :'cancel_request_id'::uuid
  ),
  'not_required',
  'cancelled posted request never moved payment to pending'
);

select lives_ok(
  format('select cancel_request(%L)', :'cancel_request_id'),
  'cancel_request is idempotent'
);

select is(
  (
    select count(*)::int
    from public.wallet_transactions wt
    where wt.request_id = :'cancel_request_id'::uuid
      and wt.type = 'refund'::public.wallet_transaction_type
  ),
  0,
  'no refund wallet transaction when funds were never locked'
);

-- Cancellation after acceptance refunds held funds ----------------------------------

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select create_request(
  'Cancel after accept',
  'Held funds return on cancel.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  4000
) as cancel_after_accept_id \gset

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as _ \gset
select respond_to_request(
  :'cancel_after_accept_id'::uuid,
  null,
  null,
  6.5000,
  3.3800
) as cancel_after_accept_response_id \gset

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select lives_ok(
  format('select accept_response(%L)', :'cancel_after_accept_response_id'),
  'accept locks funds before cancellation test'
);

select is(
  (
    select available_balance
    from public.wallets
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
  ),
  100000::bigint,
  'accept locks funds for the cancellable engagement'
);

select lives_ok(
  format('select cancel_request(%L)', :'cancel_after_accept_id'),
  'cancel after accept opens a pending cancellation request'
);

select is(
  (
    select available_balance
    from public.wallets
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
  ),
  100000::bigint,
  'funds stay locked while client cancellation awaits provider consent'
);

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as _ \gset
select lives_ok(
  format(
    $$select respond_engagement_cancellation(%L::uuid, true, null)$$,
    :'cancel_after_accept_id'
  ),
  'provider agrees to client cancellation and triggers refund'
);

select is(
  (
    select available_balance
    from public.wallets
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
  ),
  500000::bigint,
  'agreed cancellation after accept returns held amount to available balance'
);

select is(
  (
    select status::text
    from public.payment_locks
    where request_id = :'cancel_after_accept_id'::uuid
  ),
  'refunded',
  'cancelled engagement lock marked refunded'
);

select is(
  (
    select count(*)::int
    from public.wallet_transactions wt
    where wt.request_id = :'cancel_after_accept_id'::uuid
      and wt.type = 'refund'::public.wallet_transaction_type
  ),
  1,
  'one refund wallet transaction after accepted cancellation'
);

select * from finish();

rollback;
