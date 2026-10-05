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

select create_request(
  'Title only',
  null,
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as optional_description_request_id \gset

select is(
  (select description from public.requests where id = :'optional_description_request_id'::uuid),
  null,
  'create_request accepts a null description (optional details step)'
);

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
  7500::numeric,
  'escrow total equals the offer; fee is taken at payout'
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

select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  0::bigint,
  'a pending response removes the request from public discovery for that helper'
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
  'someone is already helping on this request',
  'a requester cannot select a second helper on the same request'
);

select is(
  (select status::text from my_requests where request_id = :'request_id'),
  'accepted',
  'selection moves the request to accepted'
);

select is(
  (select agreed_provider_amount from public.requests where id = :'request_id'::uuid),
  7500::numeric,
  'selection stores the counter offer as the agreed amount'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (select provider_amount from public.request_escrow where request_id = :'request_id'::uuid),
  6750::numeric,
  'escrow stores the helper net payout (90% of agreed offer)'
);

select is(
  (select total from public.request_escrow where request_id = :'request_id'::uuid),
  7500::numeric,
  'escrow total equals the agreed offer amount'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Lower counter',
  'Accepting a lower counter offer refunds the difference.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as lower_offer_request_id \gset

select pg_temp.act_as('33333333-3333-3333-3333-333333333333') as _ \gset
select respond_to_request(
  :'lower_offer_request_id'::uuid,
  null,
  4000,
  6.5000,
  3.3800
) as lower_offer_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select accept_response(%L)', :'lower_offer_response_id'),
  'requester can accept a lower counter offer'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (select total from public.request_escrow where request_id = :'lower_offer_request_id'::uuid),
  4000::numeric,
  'a lower counter offer reduces the locked total to the new offer'
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
  'This person is currently attending to another request.',
  'another request cannot select a helper who is already attending a job'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (
    select responder_available
    from list_request_responses(:'second_request_id')
    where response_id = :'second_response_id'
  ),
  false,
  'requesters see when a responder is attending another request'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select respond_to_request(%L, null, null, 6.5000, 3.3800)', :'second_request_id'),
  'a helper can still respond to other requests while attending a job'
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

-- Service lifecycle after selection -------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select start_request(%L)', :'request_id'),
  'the selected helper can move the request to in progress'
);

select is(
  (select request_status::text from get_engagement(:'request_id')),
  'in_progress',
  'start_request writes in_progress on the request'
);

select lives_ok(
  format('select mark_service_complete(%L)', :'request_id'),
  'the selected helper can mark the request completion pending'
);

select is(
  (select request_status::text from get_engagement(:'request_id')),
  'completion_pending',
  'mark_service_complete moves the request to completion_pending'
);

select ok(
  (select completion_confirm_by from get_engagement(:'request_id')) > now(),
  'mark_service_complete sets a confirmation deadline'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select complete_request(%L)', :'request_id'),
  'the requester can confirm completion'
);

select is(
  (select status::text from public.requests where id = :'request_id'::uuid),
  'completed',
  'confirmation completes the request'
);

select is(
  (select payment_status::text from public.requests where id = :'request_id'::uuid),
  'released',
  'confirmation releases escrow to the helper wallet'
);

select lives_ok(
  format('select rate_request(%L::uuid, 5::smallint, %L)', :'request_id', 'Great work'),
  'requester can rate the selected helper after completion'
);

select is(
  (
    select ratee_id
    from public.ratings
    where request_id = :'request_id'::uuid
      and rater_id = '11111111-1111-1111-1111-111111111111'::uuid
  ),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'rating is stored against the selected helper'
);

select ok(
  (select viewer_has_rated from get_engagement(:'request_id')),
  'requester has submitted a rating'
);

select is(
  (select rating_stars from get_engagement(:'request_id')),
  null::smallint,
  'requester does not yet see their own rating on the completion card'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset

select lives_ok(
  format('select rate_request(%L::uuid, 4::smallint, %L)', :'request_id', 'Clear brief'),
  'helper can rate the requester after completion'
);

select is(
  (
    select ratee_id
    from public.ratings
    where request_id = :'request_id'::uuid
      and rater_id = '22222222-2222-2222-2222-222222222222'::uuid
  ),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'helper rating is stored against the requester'
);

select ok(
  (select viewer_has_rated from get_engagement(:'request_id')),
  'helper has submitted a rating'
);

select is(
  (select rating_stars from get_engagement(:'request_id')),
  5::smallint,
  'helper sees the requester rating on the completion card'
);

select is(
  (select rating_comment from get_engagement(:'request_id')),
  'Great work',
  'helper sees the requester rating comment'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset

select is(
  (select rating_stars from get_engagement(:'request_id')),
  4::smallint,
  'requester sees the helper rating on the completion card'
);

select is(
  (select rating_comment from get_engagement(:'request_id')),
  'Clear brief',
  'requester sees the helper rating comment'
);

select pg_temp.act_as_owner() as _ \gset
select ok(
  (select request_id from public.user_attendance where user_id = '22222222-2222-2222-2222-222222222222') is null,
  'completion clears helper attendance'
);

select pg_temp.act_as('55555555-5555-5555-5555-555555555555') as _ \gset
select respond_to_request(
  :'cleaning_request_id'::uuid,
  'I can mop the hallway.',
  null,
  6.5000,
  3.3800
) as cleaning_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select accept_response(%L)', :'cleaning_response_id'),
  'select a helper on the cleaning request for auto-complete coverage'
);

select pg_temp.act_as('55555555-5555-5555-5555-555555555555') as _ \gset
select lives_ok(
  format('select mark_service_complete(%L)', :'cleaning_request_id'),
  'helper marks the cleaning request complete'
);

select pg_temp.act_as_owner() as _ \gset
update public.requests
set completion_confirm_by = now() - interval '1 minute'
where id = :'cleaning_request_id'::uuid;

select ok(
  public.auto_complete_request(:'cleaning_request_id'::uuid),
  'auto_complete_request completes after the confirmation window'
);

select is(
  (select status::text from public.requests where id = :'cleaning_request_id'::uuid),
  'completed',
  'automatic completion writes completed status'
);

select ok(
  not public.auto_complete_request(:'cleaning_request_id'::uuid),
  'auto_complete_request is idempotent once completed'
);

-- Expiration idempotency and selection race -----------------------------------------

select pg_temp.act_as_owner() as _ \gset
select ok(
  not public.expire_request(:'expired_request_id'::uuid),
  'expire_request is idempotent once the row is already expired'
);

select is(
  (select count(*) from public.request_status_events
   where request_id = :'expired_request_id'::uuid and to_status = 'expired'),
  1::bigint,
  'expiration records a single status event'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Past window',
  'Nobody can be chosen after the open window ends.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as past_window_request_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'past_window_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800
) as past_window_response_id \gset

select pg_temp.act_as_owner() as _ \gset
update public.requests
set expires_at = now() - interval '1 minute'
where id = :'past_window_request_id'::uuid;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select accept_response(%L)', :'past_window_response_id'),
  '55000',
  null,
  'selection is rejected once the request open window has ended'
);

select pg_temp.act_as_owner() as _ \gset
select ok(
  not public.expire_request(:'request_id'::uuid),
  'expiration does not override a request that was already selected'
);

-- Cancellation before selection -----------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Cancel with responses',
  'Funded request cancelled before selection.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  4000
) as cancel_funded_request_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'cancel_funded_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800
) as _ \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select cancel_request(%L)', :'cancel_funded_request_id'),
  'requester can cancel before selection'
);

select is(
  (select status::text from public.requests where id = :'cancel_funded_request_id'::uuid),
  'cancelled',
  'cancellation writes cancelled status'
);

select is(
  (select payment_status::text from public.requests where id = :'cancel_funded_request_id'::uuid),
  'refunded',
  'pre-selection cancellation refunds locked funds'
);

select is(
  (select status::text from public.request_responses
   where request_id = :'cancel_funded_request_id'::uuid
   limit 1),
  'expired',
  'pending responses become inactive when the requester cancels'
);

select is(
  (select count(*) from public.request_status_events
   where request_id = :'cancel_funded_request_id'::uuid and to_status = 'cancelled'),
  1::bigint,
  'cancellation records a status event'
);

select lives_ok(
  format('select cancel_request(%L)', :'cancel_funded_request_id'),
  'cancel_request is idempotent after the request is already cancelled'
);

-- Authorization and privacy hardening ------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format(
    $$select respond_to_request(%L, null, null, 6.5000, 3.3800)$$,
    :'second_request_id'
  ),
  '55000',
  null,
  'the requester cannot respond to their own request'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333') as _ \gset
select is(
  (select count(*) from list_request_responses(:'request_id')),
  0::bigint,
  'only the requester can list responses on a request'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select is(
  (select count(*) from get_engagement(:'request_id')),
  0::bigint,
  'bystanders cannot read engagement details'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select mark_service_complete(%L)', :'second_request_id'),
  'P0002',
  null,
  'the requester cannot mark a request complete for the helper'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select throws_ok(
  format('select complete_request(%L)', :'request_id'),
  'P0002',
  null,
  'only the requester can confirm completion on their request'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select complete_request(%L)', :'request_id'),
  'confirming completion again is idempotent once completed'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (select count(*)
   from public.payment_transitions
   where request_id = :'request_id'::uuid
     and idempotency_key = 'complete:' || :'request_id'),
  1::bigint,
  'payment release uses a single idempotent completion transition'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  $$update public.profiles set phone = '+2348000000999' where id = auth.uid()$$,
  '42501',
  'profile field is server managed and cannot be set by a client',
  'clients cannot forge a verified phone number on their profile'
);

select throws_ok(
  $$update public.profiles
    set avatar_captured_in_app = true, avatar_path = 'fake/avatar.jpg'
    where id = auth.uid()$$,
  '42501',
  'profile field is server managed and cannot be set by a client',
  'clients cannot forge an in-app profile photo'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Cancel during selection',
  'Cancelled while a response is still pending.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as cancel_race_request_id \gset

select pg_temp.act_as('33333333-3333-3333-3333-333333333333') as _ \gset
select respond_to_request(
  :'cancel_race_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800
) as cancel_race_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select cancel_request(%L)', :'cancel_race_request_id'),
  'requester can cancel before selection completes'
);

select throws_ok(
  format('select accept_response(%L)', :'cancel_race_response_id'),
  '55000',
  null,
  'selection fails after the request was cancelled'
);

select * from finish();

rollback;
