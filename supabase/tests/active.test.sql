-- Core marketplace rules: public discovery, responses, selection, attendance, and privacy.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- Fixtures --------------------------------------------------------------------------
--
-- Coordinates around Yaba, Lagos (~1.1 km per 0.01° latitude):
--   6.5000  -> request site
--   6.5400  -> ~4.4 km (inside 50 km discovery)
--   7.5000  -> ~110 km (outside 50 km discovery)

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

select pg_temp.make_user('11111111-1111-1111-1111-111111111111', 'Amaka Requester', '+2348000000101') as _ \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    '11111111-1111-1111-1111-111111111111'::uuid,
    5000000,
    'test-seed-requester-wallet',
    'test'
  )$$,
  'fund the requester wallet for escrow tests'
);

select pg_temp.make_user('22222222-2222-2222-2222-222222222222', 'Near Helper', '+2348000000102') as _ \gset
select pg_temp.make_user('33333333-3333-3333-3333-333333333333', 'Alt Helper', '+2348000000103') as _ \gset
select pg_temp.make_user('55555555-5555-5555-5555-555555555555', 'Far Helper', '+2348000000105') as _ \gset
select pg_temp.make_user('66666666-6666-6666-6666-666666666666', 'Browser', '+2348000000106') as _ \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Generator repair',
  'My generator will not start. 5kVA, was fine yesterday.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as request_id \gset

select create_request(
  'Hallway cleaning',
  'Need the hallway mopped before guests arrive.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as cleaning_request_id \gset

select create_request(
  'Expired fixture',
  'This one has already run past its window.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as expired_request_id \gset

select create_request(
  'Cancelled fixture',
  'This one will be cancelled before anyone answers.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as cancelled_request_id \gset

select pg_temp.act_as_owner() as _ \gset
update public.requests
set expires_at = now() - interval '1 minute'
where id = :'expired_request_id';

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select cancel_request(%L)', :'cancelled_request_id'),
  'the requester can cancel a posted request'
);

-- Discovery -------------------------------------------------------------------------

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  1::bigint,
  'any signed-in user can browse a posted request near them'
);

select is(
  (select distance_m from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  100,
  'browsed distance is bucketed rather than exact'
);

select is(
  (select count(*) from browse_nearby_requests(7.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  0::bigint,
  'a browser outside discovery radius does not see the request'
);

select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'expired_request_id'),
  0::bigint,
  'an expired request disappears from discovery while still posted on the row'
);

select is(
  (select count(*) from browse_request(:'expired_request_id', 6.5000::double precision, 3.3800::double precision)),
  0::bigint,
  'an expired request cannot be opened from discovery'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  public.expire_request(:'expired_request_id'::uuid),
  true,
  'expire_request persists a due posted request as expired'
);

select is(
  (select status::text from public.requests where id = :'expired_request_id'::uuid),
  'expired',
  'expiration writes the expired status on the request row'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'cancelled_request_id'),
  0::bigint,
  'a cancelled request disappears from discovery'
);

select is(
  (select description from browse_request(:'request_id', 6.5000::double precision, 3.3800::double precision)),
  'My generator will not start. 5kVA, was fine yesterday.',
  'opening a nearby request returns its public description'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  0::bigint,
  'a requester does not see their own request in public discovery'
);

select pg_temp.act_as_owner() as _ \gset
select ok(
  not exists (
    select 1
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('browse_nearby_requests', 'browse_request')
      and pg_get_function_result(p.oid) ~* 'response_count|phone|latitude|longitude'
  ),
  'public discovery does not return response counts, phone, or coordinates'
);

-- Escrow on expiration --------------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Funded expiry',
  'Funded request that should refund when the window ends.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  7500
) as funded_expired_request_id \gset

select pg_temp.act_as_owner() as _ \gset
update public.requests
set expires_at = now() - interval '1 minute'
where id = :'funded_expired_request_id'::uuid;

select ok(
  public.expire_request(:'funded_expired_request_id'::uuid),
  'expiration refunds locked funds on a funded request'
);

select is(
  (select payment_status::text from public.requests where id = :'funded_expired_request_id'::uuid),
  'refunded',
  'expiration moves locked payment status to refunded'
);

select is(
  (select total from public.request_escrow where request_id = :'funded_expired_request_id'::uuid),
  8250::numeric,
  'escrow total includes the 10% service fee on a 7500 offer'
);

-- Privacy before selection ----------------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select count(*) from public.requests where id = :'request_id'),
  0::bigint,
  'a browser cannot read the request row itself before selection'
);

select is(
  (select count(*) from get_engagement(:'request_id')),
  0::bigint,
  'nobody gets engagement details before selection'
);

select is(
  (select count(*) from public.profiles where id <> auth.uid()),
  0::bigint,
  'a user cannot read anyone else''s profile; counterparty details come from functions'
);

select is(
  (select count(*) from public.user_attendance where user_id <> auth.uid()),
  0::bigint,
  'a user cannot read anyone else''s attendance row'
);

select throws_ok(
  $$insert into public.requests (
      requester_id, title, description, location, location_label
    )
    values (
      auth.uid(), 'Hack', 'writing straight to the table instead',
      extensions.ST_SetSRID(extensions.ST_MakePoint(3.38, 6.5), 4326)::extensions.geography,
      'Yaba, Lagos'
    )$$,
  '42501',
  null,
  'a client cannot write a request directly; only create_request can'
);

select pg_temp.act_as('55555555-5555-5555-5555-555555555555') as _ \gset
select throws_ok(
  format(
    $$select respond_to_request(%L, null, null, %s, %s)$$,
    :'request_id',
    7.5000,
    3.3800
  ),
  '55000',
  'this request is no longer available to you',
  'responding is distance-checked from the position sent'
);

-- Responding ------------------------------------------------------------------------

select pg_temp.act_as('55555555-5555-5555-5555-555555555555') as _ \gset
select pg_temp.act_as_owner() as _ \gset
update public.profiles
set avatar_path = null,
    avatar_captured_in_app = false
where id = '55555555-5555-5555-5555-555555555555'::uuid;

select pg_temp.act_as('55555555-5555-5555-5555-555555555555') as _ \gset
select throws_ok(
  format(
    $$select respond_to_request(%L, null, null, 6.5000, 3.3800)$$,
    :'request_id'
  ),
  '55000',
  'add a profile photo in the app before responding',
  'responding requires an in-app profile photo'
);

select pg_temp.act_as_owner() as _ \gset
update public.profiles
set avatar_path = '55555555-5555-5555-5555-555555555555/avatar.jpg',
    avatar_captured_in_app = true
where id = '55555555-5555-5555-5555-555555555555'::uuid;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'request_id',
  'I fix these. Can be there soon.',
  7000,
  6.5000,
  3.3800
) as response_id \gset

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select is(
  (select count(*) from public.request_responses where request_id = :'request_id'),
  0::bigint,
  'a browser cannot see who responded or how many responses exist'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format(
    $$select respond_to_request(%L, %L, %L, %L, %L)$$,
    :'request_id',
    'Updated note.',
    7500,
    6.5000,
    3.3800
  ),
  'responding twice updates the same pending response idempotently'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select count(*) from list_request_responses(:'request_id')),
  1::bigint,
  'the requester sees the response'
);

select is(
  (select pending_response_count from my_requests where request_id = :'request_id'),
  1,
  'the request reports a waiting response while it is still posted'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333') as _ \gset
select respond_to_request(
  :'request_id',
  'I can take this one too.',
  6500,
  6.5400,
  3.3800
) as alternate_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Second generator',
  'Second generator, same street, still will not start.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as second_request_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select respond_to_request(%L, null, null, 6.5000, 3.3800)', :'second_request_id'),
  'a helper can respond to another request before being selected'
);

select id as second_response_id
from public.request_responses
where request_id = :'second_request_id'
  and responder_id = '22222222-2222-2222-2222-222222222222' \gset

-- Selection and attendance ----------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select accept_response(%L)', :'response_id'),
  'the requester selects one helper'
);

select throws_ok(
  format('select accept_response(%L)', :'alternate_response_id'),
  '55000',
  'this request is already accepted',
  'a requester cannot select a second helper on the same request'
);

select is(
  (select status::text from my_requests where request_id = :'request_id'),
  'accepted',
  'selection moves the request to accepted'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (select request_id from public.user_attendance where user_id = '22222222-2222-2222-2222-222222222222'),
  :'request_id'::uuid,
  'selection records attendance on the chosen helper'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select accept_response(%L)', :'second_response_id'),
  '55000',
  'This person is already on another job.',
  'another request cannot select a helper who is already attending a job'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select throws_ok(
  format('select respond_to_request(%L, null, null, 6.5000, 3.3800)', :'second_request_id'),
  '55000',
  'this request is no longer available to you',
  'attending one job blocks responding elsewhere'
);

-- Privacy after selection -----------------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select count(*) from public.requests where id = :'request_id'),
  1::bigint,
  'the selected helper can now read the request row'
);

select is(
  (select counterparty_phone from get_engagement(:'request_id')),
  '+2348000000101',
  'the selected helper receives the requester''s phone number'
);

select ok(
  (select request_latitude from get_engagement(:'request_id')) = 6.5000,
  'the selected helper receives the exact location'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  0::bigint,
  'a request leaves public discovery once someone is selected'
);

select * from finish();

rollback;
