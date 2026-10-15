-- Alternative responses stay available across accept, withdraw, and engagement cancellation.

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

select pg_temp.make_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alt Requester', '+2348000000301') as _ \gset
select pg_temp.make_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Alt Helper A', '+2348000000302') as _ \gset
select pg_temp.make_user('11111111-1111-1111-1111-111111111112', 'Alt Helper B', '+2348000000303') as _ \gset
select pg_temp.make_user('22222222-2222-2222-2222-222222222222', 'Alt Helper C', '+2348000000304') as _ \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    3000000,
    'alt-responses-seed',
    'alt-responses-seed'
  )$$,
  'seed requester wallet'
);

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select create_request(
  'Alt responses fixture',
  'Need help with shelves.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as alt_request_id \gset

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as _ \gset
select respond_to_request(
  :'alt_request_id'::uuid,
  'Offer A message',
  null,
  6.0000,
  3.3800
) as alt_response_a \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111112') as _ \gset
select respond_to_request(
  :'alt_request_id'::uuid,
  'Offer B message',
  null,
  6.2500,
  3.3800
) as alt_response_b \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'alt_request_id'::uuid,
  'Offer C message',
  null,
  6.5000,
  3.3800
) as alt_response_c \gset

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select lives_ok(
  format('select accept_response(%L)', :'alt_response_a'),
  'accept helper A'
);

select is(
  (
    select count(*)::int
    from public.request_responses rr
    where rr.request_id = :'alt_request_id'::uuid
      and rr.status = 'pending'
  ),
  2,
  'other responses remain pending after accept'
);

select is(
  (
    select message
    from public.request_responses
    where id = :'alt_response_b'::uuid
  ),
  'Offer B message',
  'alternative offer message preserved'
);

select is(
  (select count(*) from list_request_responses(:'alt_request_id'::uuid)),
  3::bigint,
  'list includes accepted and pending alternatives during engagement'
);

select throws_ok(
  format('select accept_response(%L)', :'alt_response_b'),
  '55000',
  null,
  'cannot accept a second provider while engagement is active'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111112') as _ \gset
select lives_ok(
  format('select withdraw_response(%L)', :'alt_response_c'),
  'provider C withdraws while another engagement is active'
);

select is(
  (
    select status::text
    from public.request_responses
    where id = :'alt_response_c'::uuid
  ),
  'withdrawn',
  'withdrawn offer is no longer pending'
);

select throws_ok(
  format('select accept_response(%L)', :'alt_response_c'),
  '55000',
  null,
  'withdrawn offer cannot be accepted'
);

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as _ \gset
select lives_ok(
  format(
    $$select cancel_engagement_as_provider(%L::uuid, %L)$$,
    :'alt_request_id',
    'Cannot make it'
  ),
  'provider A cancels engagement'
);

select is(
  (
    select status::text
    from public.requests
    where id = :'alt_request_id'::uuid
  ),
  'posted',
  'request reopens without reposting'
);

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select lives_ok(
  format('select open_pre_handshake_conversation(%L)', :'alt_response_b'),
  'pre-handshake chat works after prior engagement ended'
);

select lives_ok(
  format('select accept_response(%L)', :'alt_response_b'),
  'accept helper B from preserved offer'
);

select is(
  (
    select count(*)::int
    from public.payment_locks
    where request_id = :'alt_request_id'::uuid
  ),
  1,
  're-accept reuses the same payment lock row after cancellation refund'
);

select is(
  (
    select status::text
    from public.payment_locks
    where request_id = :'alt_request_id'::uuid
  ),
  'active',
  'payment lock is active again after re-accept'
);

select is(
  (
    select quoted_amount
    from public.request_responses
    where id = :'alt_response_b'::uuid
  ),
  6.2500::numeric,
  'preserved quoted amount used on fallback accept'
);

-- Insufficient wallet balance on a fresh open request -------------------------------------

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select create_request(
  'Alt unfunded accept',
  'Need help.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5001
) as alt_unfunded_request_id \gset

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as _ \gset
select respond_to_request(
  :'alt_unfunded_request_id'::uuid,
  'Ready',
  null,
  6.5000,
  3.3800
) as alt_unfunded_response_id \gset

select pg_temp.act_as_owner() as _ \gset
update public.wallets
set available_balance = 0
where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select throws_ok(
  format('select accept_response(%L)', :'alt_unfunded_response_id'),
  '55000',
  null,
  'insufficient wallet balance blocks accept'
);

select is(
  (
    select status::text
    from public.requests
    where id = :'alt_unfunded_request_id'::uuid
  ),
  'posted',
  'request stays open when accept fails for insufficient funds'
);

select * from finish();

rollback;
