-- Tests for the two things the product cannot get wrong: who a request reaches, and
-- what each side can see about the other before and after acceptance.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- Fixtures --------------------------------------------------------------------------
--
-- Coordinates are around Yaba, Lagos. Geodesic distance for 0.01 degrees of latitude on
-- WGS84 is ~1.106 km, which the offsets below are built from:
--   6.5000  ->  0 m from the request
--   6.5400  ->  ~4.42 km, inside a 5 km search radius
--   6.5600  ->  ~6.64 km, outside a 5 km search radius but inside a 10 km service radius

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

  -- public.handle_new_user has created the profile shell; finish onboarding.
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
select pg_temp.make_user('22222222-2222-2222-2222-222222222222', 'Near Repairer', '+2348000000102') as _ \gset
select pg_temp.make_user('33333333-3333-3333-3333-333333333333', 'Far Repairer', '+2348000000103') as _ \gset
select pg_temp.make_user('44444444-4444-4444-4444-444444444444', 'Short Range Repairer', '+2348000000104') as _ \gset
select pg_temp.make_user('55555555-5555-5555-5555-555555555555', 'Cleaner Only', '+2348000000105') as _ \gset
select pg_temp.make_user('66666666-6666-6666-6666-666666666666', 'Never Active', '+2348000000106') as _ \gset

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select pg_temp.act_as_owner() as _ \gset
update public.profiles
set avatar_path = null, avatar_captured_in_app = false
where id = '66666666-6666-6666-6666-666666666666';

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select throws_ok(
  $$select go_active(6.5000, 3.3800, 10000, array['repair'], 240)$$,
  '55000',
  'capture a profile photo in the app before going Active',
  'going Active without an in-app profile photo is rejected'
);

select pg_temp.act_as_owner() as _ \gset
select pg_temp.make_user('77777777-7777-7777-7777-777777777777', 'Lapsed Repairer', '+2348000000107') as _ \gset

-- Each provider going Active exercises one of the five eligibility rules.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  $$select go_active(6.5000, 3.3800, 10000, array['repair'], 240)$$,
  'a provider can go Active with a category, a radius and a duration'
);

select is(
  (select count(*)::bigint from public.profile_catalogue_media
   where user_id = '22222222-2222-2222-2222-222222222222'),
  0::bigint,
  'going Active does not require catalogue photos or video'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333') as _ \gset
select lives_ok($$select go_active(6.5600, 3.3800, 10000, array['repair'], 240)$$);

select pg_temp.act_as('44444444-4444-4444-4444-444444444444') as _ \gset
select lives_ok($$select go_active(6.5400, 3.3800, 2000, array['repair'], 240)$$);

select pg_temp.act_as('55555555-5555-5555-5555-555555555555') as _ \gset
select lives_ok($$select go_active(6.5000, 3.3800, 10000, array['cleaning'], 240)$$);

select pg_temp.act_as('77777777-7777-7777-7777-777777777777') as _ \gset
select lives_ok($$select go_active(6.5000, 3.3800, 10000, array['repair'], 240)$$);

select throws_ok(
  $$select go_active(6.5000, 3.3800, 10000, array['teleportation'], 240)$$,
  '22023',
  'unknown service category',
  'going Active with a category that does not exist is refused'
);

select throws_ok(
  $$select go_active(6.5000, 3.3800, 10000, array[]::text[], 240)$$,
  '22023',
  'choose at least one service you can provide',
  'going Active without choosing a service is refused'
);

-- "Never Active" does nothing. "Lapsed Repairer" has their window forced into the past.
select pg_temp.act_as_owner() as _ \gset
update public.provider_availability
set expires_at = now() - interval '1 minute'
where user_id = '77777777-7777-7777-7777-777777777777';

-- The requester also offers repairs, to prove nobody is matched to their own request.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok($$select go_active(6.5000, 3.3800, 10000, array['repair'], 240)$$);

select create_request(
  'repair',
  'My generator will not start. 5kVA, was fine yesterday.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  5000
) as request_id \gset

-- Matching --------------------------------------------------------------------------

select pg_temp.act_as_owner() as _ \gset
update public.profiles
set avatar_captured_in_app = false
where id = '22222222-2222-2222-2222-222222222222';

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select count(*) from nearby_requests() where request_id = :'request_id'),
  0::bigint,
  'a provider without an in-app profile photo is not matched'
);

select pg_temp.act_as_owner() as _ \gset
update public.profiles
set avatar_captured_in_app = true
where id = '22222222-2222-2222-2222-222222222222';

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select count(*) from nearby_requests() where request_id = :'request_id'),
  1::bigint,
  'an Active provider offering the category and inside both radii receives the request'
);

select is(
  (select distance_m from nearby_requests() where request_id = :'request_id'),
  100,
  'distance is bucketed to a 100 m floor rather than reported exactly'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333') as _ \gset
select is(
  (select count(*) from nearby_requests() where request_id = :'request_id'),
  0::bigint,
  'a provider beyond the requester''s search radius is not matched'
);

select pg_temp.act_as('44444444-4444-4444-4444-444444444444') as _ \gset
select is(
  (select count(*) from nearby_requests() where request_id = :'request_id'),
  0::bigint,
  'a provider whose own service radius excludes the request is not matched'
);

select pg_temp.act_as('55555555-5555-5555-5555-555555555555') as _ \gset
select is(
  (select count(*) from nearby_requests() where request_id = :'request_id'),
  0::bigint,
  'a provider who does not offer the category is not matched'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select is(
  (select count(*) from nearby_requests() where request_id = :'request_id'),
  0::bigint,
  'a provider who never went Active is not matched'
);

select pg_temp.act_as('77777777-7777-7777-7777-777777777777') as _ \gset
select is(
  (select count(*) from nearby_requests() where request_id = :'request_id'),
  0::bigint,
  'a provider whose Active window has lapsed is not matched'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select count(*) from nearby_requests() where request_id = :'request_id'),
  0::bigint,
  'a requester is never matched to their own request'
);

-- Public discovery does not require going Active, and it never returns private fields.
select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  1::bigint,
  'someone who is not Active can still browse a searching request near them'
);

select is(
  (select distance_m from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  100,
  'browsed distance is bucketed rather than exact'
);

select is(
  (select count(*) from browse_nearby_requests(6.5600::double precision, 3.3800::double precision) where request_id = :'request_id'),
  0::bigint,
  'a browser outside the request search radius does not see it'
);

select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision, 'repair') where request_id = :'request_id'),
  1::bigint,
  'category filtering keeps a request in its own category'
);

select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision, 'cleaning') where request_id = :'request_id'),
  0::bigint,
  'category filtering hides a request from other categories'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'cleaning',
  'Need the hallway mopped before guests arrive.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  5000
) as cleaning_request_id \gset

select create_request(
  'repair',
  'This one has already run past its search window.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  5000
) as expired_request_id \gset

select create_request(
  'repair',
  'This one will be cancelled before anyone answers.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  5000
) as cancelled_request_id \gset

select pg_temp.act_as_owner() as _ \gset
update public.requests
set expires_at = now() - interval '1 minute'
where id = :'expired_request_id';

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select cancel_request(%L)', :'cancelled_request_id'),
  'the requester can cancel a searching request'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision, 'cleaning') where request_id = :'cleaning_request_id'),
  1::bigint,
  'a category filter returns the matching nearby request'
);

select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'expired_request_id'),
  0::bigint,
  'an expired request disappears from discovery even if its status is still searching'
);

select is(
  (select count(*) from browse_request(:'expired_request_id', 6.5000::double precision, 3.3800::double precision)),
  0::bigint,
  'an expired request cannot be opened from discovery'
);

select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'cancelled_request_id'),
  0::bigint,
  'a cancelled request disappears from discovery'
);

select is(
  (select count(*) from browse_request(:'cancelled_request_id', 6.5000::double precision, 3.3800::double precision)),
  0::bigint,
  'a cancelled request cannot be opened from discovery'
);

select is(
  (select count(*) from public.requests where id = :'request_id'),
  0::bigint,
  'a browser cannot read the request row, so exact coordinates stay on the table'
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
      and pg_get_function_result(p.oid) ~* 'response_count|phone|display_name|avatar|latitude|longitude|provider'
  ),
  'public discovery does not return responders, counts, contact details, or coordinates'
);

-- Privacy before acceptance ---------------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select count(*) from public.requests where id = :'request_id'),
  0::bigint,
  'a matched provider cannot read the request row itself before acceptance'
);

select is(
  (select count(*) from get_engagement(:'request_id')),
  0::bigint,
  'a matched provider gets no engagement details before acceptance'
);

select is(
  (select count(*) from public.profiles where id <> auth.uid()),
  0::bigint,
  'a user cannot read anyone else''s profile; counterparty details come from functions'
);

select is(
  (select count(*) from public.provider_availability where user_id <> auth.uid()),
  0::bigint,
  'a user cannot read anyone else''s availability, which is where provider coordinates live'
);

select throws_ok(
  $$insert into public.requests (
      requester_id, category_slug, description, location, location_label, search_radius_m
    )
    values (
      auth.uid(), 'repair', 'writing straight to the table instead',
      extensions.ST_SetSRID(extensions.ST_MakePoint(3.38, 6.5), 4326)::extensions.geography,
      'Yaba, Lagos', 5000
    )$$,
  '42501',
  null,
  'a client cannot write a request directly; only create_request can'
);

select throws_ok(
  $$update public.profiles set rating_count = 99, rating_average = 5 where id = auth.uid()$$,
  '42501',
  'profile field is server managed and cannot be set by a client',
  'a client cannot inflate their own reputation'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select count(*) from get_engagement(:'request_id')),
  0::bigint,
  'even the requester gets no engagement details before they accept someone'
);

select pg_temp.act_as_owner() as _ \gset
select ok(
  not exists (
    select 1
    from pg_proc, unnest(proargnames) as argument(name)
    where proname in ('nearby_requests', 'list_request_responses', 'my_responses')
      and pronamespace = 'public'::regnamespace
      and argument.name in ('location', 'latitude', 'longitude')
  ),
  'no pre-acceptance function exposes a coordinate column'
);

select is(
  (select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname in ('requests', 'request_responses', 'provider_availability')
     and p.polcmd <> 'r'),
  0::bigint,
  'no policy lets a client write matching state directly; only the functions can'
);

-- A provider who was never eligible cannot respond even by calling the function
-- directly with a request id they somehow learned.
select pg_temp.act_as('55555555-5555-5555-5555-555555555555') as _ \gset
select throws_ok(
  format('select respond_to_request(%L)', :'request_id'),
  '55000',
  'this request is no longer available to you',
  'responding is re-checked against the matching rule, not the caller''s word'
);

-- Responding and accepting ----------------------------------------------------------

select pg_temp.act_as_owner() as _ \gset
update public.provider_availability
set location = extensions.ST_SetSRID(extensions.ST_MakePoint(3.3800, 6.5600), 4326)::extensions.geography
where user_id = '22222222-2222-2222-2222-222222222222';

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select throws_ok(
  format('select respond_to_request(%L)', :'request_id'),
  '55000',
  'this request is no longer available to you',
  'a stored position outside both radii cannot answer the request'
);

select respond_to_request(
  :'request_id',
  'I fix these. Thirty minutes away.',
  7000,
  30,
  6.5000,
  3.3800
) as response_id \gset

select pg_temp.act_as_owner() as _ \gset
select ok(
  extensions.ST_DWithin(
    (select location from public.provider_availability
     where user_id = '22222222-2222-2222-2222-222222222222'),
    extensions.ST_SetSRID(extensions.ST_MakePoint(3.3800, 6.5000), 4326)::extensions.geography,
    1
  ),
  'responding moves matching to the position the provider sent from'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  1::bigint,
  'a request stays discoverable after someone responds'
);

select is(
  (select count(*) from public.request_responses where request_id = :'request_id'),
  0::bigint,
  'a browser cannot see who responded or how many responses exist'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (select status::text from public.provider_availability
   where user_id = '22222222-2222-2222-2222-222222222222'),
  'available',
  'responding leaves the provider available for other requests'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'repair',
  'Second generator, same street, still will not start.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  5000
) as second_request_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select respond_to_request(%L)', :'second_request_id'),
  'a provider can respond to another request without becoming unavailable'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (select status::text from public.provider_availability
   where user_id = '22222222-2222-2222-2222-222222222222'),
  'available',
  'a second response still leaves the provider available'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset

select throws_ok(
  format('select respond_to_request(%L)', :'request_id'),
  '23505',
  null,
  'responding twice to the same request is refused'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select count(*) from list_request_responses(:'request_id')),
  1::bigint,
  'the requester sees the response'
);

select is(
  (select display_name from list_request_responses(:'request_id')),
  'Near Repairer',
  'the requester sees who responded'
);

select is(
  (select pending_response_count from my_requests where request_id = :'request_id'),
  1,
  'the request reports a waiting response while it is still searching'
);

select lives_ok(
  format('select accept_response(%L)', :'response_id'),
  'the requester accepts one provider'
);

select is(
  (select status::text from my_requests where request_id = :'request_id'),
  'accepted',
  'accepting moves the request to accepted'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (select status::text from public.provider_availability
   where user_id = '22222222-2222-2222-2222-222222222222'),
  'busy',
  'the accepted provider is taken out of matching so they cannot be double-booked'
);

select is(
  (select committed_request_id from public.provider_availability
   where user_id = '22222222-2222-2222-2222-222222222222'),
  :'request_id'::uuid,
  'the commitment names the request the handshake belongs to'
);

select is(
  (select service_radius_m from public.provider_availability
   where user_id = '22222222-2222-2222-2222-222222222222'),
  10000,
  'a commitment keeps the provider service radius'
);

select is(
  (select category_slug from public.provider_services
   where user_id = '22222222-2222-2222-2222-222222222222'),
  'repair',
  'a commitment keeps the provider service categories'
);

select is(
  (select status::text from public.request_responses
   where request_id = :'second_request_id'
     and provider_id = '22222222-2222-2222-2222-222222222222'),
  'pending',
  'answers already sent to other requests stay pending'
);

select id as second_response_id
from public.request_responses
where request_id = :'second_request_id'
  and provider_id = '22222222-2222-2222-2222-222222222222' \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select accept_response(%L)', :'second_response_id'),
  '55000',
  'This person is no longer available.',
  'another request cannot commit a provider who already has a handshake'
);

-- Privacy after acceptance ----------------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select count(*) from public.requests where id = :'request_id'),
  1::bigint,
  'the accepted provider can now read the request row'
);

select is(
  (select counterparty_phone from get_engagement(:'request_id')),
  '+2348000000101',
  'the accepted provider receives the requester''s phone number'
);

select ok(
  (select request_latitude from get_engagement(:'request_id')) = 6.5000,
  'the accepted provider receives the exact location'
);

select is(
  (select count(*) from nearby_requests() where request_id = :'request_id'),
  0::bigint,
  'a busy provider stops receiving new requests'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  0::bigint,
  'a request leaves public discovery once someone is accepted'
);

-- Completion and rating -------------------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select start_request(%L)', :'request_id'),
  'the provider marks when they begin'
);

select is(
  (select request_status::text from get_engagement(:'request_id')),
  'in_progress',
  'the request moves to in progress'
);

select throws_ok(
  format('select complete_request(%L)', :'request_id'),
  'P0002',
  'request not found',
  'a provider cannot close out work the requester has not confirmed'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select complete_request(%L)', :'request_id'),
  'the requester confirms the service happened'
);

select lives_ok(
  format('select rate_request(%L, 5::smallint, %L)', :'request_id', 'Fixed it in twenty minutes.'),
  'the requester rates the provider'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (select rating_average from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  5.00,
  'the rating lands on the provider''s profile'
);

select is(
  (select status::text from public.provider_availability
   where user_id = '22222222-2222-2222-2222-222222222222'),
  'available',
  'finishing the job returns the provider to the pool'
);

-- Going offline drops the provider from matching and clears the live position, while the
-- services and radius they last chose remain for the next session.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'repair',
  'Need a repair after the last provider went back to the pool.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  5000
) as later_request_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select count(*) from nearby_requests() where request_id = :'later_request_id'),
  1::bigint,
  'a provider who finished a job can still discover a new request'
);

select lives_ok($$select go_offline()$$, 'a provider can go offline');

select is(
  (select status::text from my_availability
   where user_id = '22222222-2222-2222-2222-222222222222'),
  'offline',
  'going offline reports the provider as offline'
);

select is(
  (select service_radius_m from my_availability
   where user_id = '22222222-2222-2222-2222-222222222222'),
  10000,
  'going offline keeps the last service radius'
);

select is(
  (select category_slugs from my_availability
   where user_id = '22222222-2222-2222-2222-222222222222'),
  array['repair']::text[],
  'going offline keeps the services they last offered'
);

select is(
  (select count(*) from nearby_requests() where request_id = :'later_request_id'),
  0::bigint,
  'an offline provider is removed from matching'
);

select pg_temp.act_as_owner() as _ \gset
select ok(
  (select location is null from public.provider_availability
   where user_id = '22222222-2222-2222-2222-222222222222'),
  'going offline stops location participation'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select count(*) from list_request_responses(:'second_request_id')),
  0::bigint,
  'an offline provider is not listed as someone who can help'
);

select is(
  (select pending_response_count from my_requests where request_id = :'second_request_id'),
  0,
  'an offline provider is not counted as a waiting response'
);

select pg_temp.act_as_owner() as _ \gset
select id as offline_response_id
from public.request_responses
where request_id = :'second_request_id'
  and provider_id = '22222222-2222-2222-2222-222222222222' \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select accept_response(%L)', :'offline_response_id'),
  '55000',
  'This person is no longer available.',
  'accepting an offline provider says they are no longer available'
);

-- A declined answer cannot be retried, so the request leaves every nearby list.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  $$select go_active(6.5000, 3.3800, 10000, array['repair'], 240)$$,
  'the provider can go Active again after being offline'
);

select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'second_request_id'),
  1::bigint,
  'a request with a pending answer stays on the public nearby list'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select decline_response(%L)', :'offline_response_id'),
  'the requester declines the provider'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'second_request_id'),
  0::bigint,
  'a declined request leaves the public nearby list'
);

select is(
  (select count(*) from browse_request(:'second_request_id', 6.5000::double precision, 3.3800::double precision)),
  0::bigint,
  'a declined request cannot be opened from nearby browse'
);

select is(
  (select count(*) from nearby_requests() where request_id = :'second_request_id'),
  0::bigint,
  'a declined request stays out of the Active inbox'
);

select * from finish();

rollback;
