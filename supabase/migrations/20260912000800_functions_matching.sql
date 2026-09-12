-- The matching rule, in one place.
--
-- A provider may receive a request when all of the following hold:
--   1. they are Active and their availability window has not lapsed;
--   2. they offer the requested category;
--   3. they are geographically resolvable, i.e. both sides have a position;
--   4. the request is within the provider's service radius;
--   5. the provider is within the request's search radius.
--
-- Rules 4 and 5 are a single distance test against the smaller of the two radii: both
-- boundaries must contain the other party.
--
-- The same pairing is needed from both directions — "which requests can this provider
-- see" and "which providers should hear about this request" — so it is expressed once
-- and filtered by whichever side is known. Every read, write and notification path that
-- depends on eligibility calls this, so a provider's inbox, the responses the server
-- will accept, and who gets told about a request can never disagree.
--
-- At least one argument is always supplied; passing neither would pair every provider
-- with every open request.
create function public.matches(
  p_request_id uuid default null,
  p_provider_id uuid default null
)
returns table (request_id uuid, provider_id uuid, distance_m double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
         pa.user_id,
         extensions.ST_Distance(r.location, pa.location)
  from public.provider_availability pa
  join public.provider_services ps on ps.user_id = pa.user_id
  join public.requests r on r.category_slug = ps.category_slug
  where (p_provider_id is null or pa.user_id = p_provider_id)
    and (p_request_id is null or r.id = p_request_id)
    and pa.status = 'available'
    and pa.expires_at > now()
    and pa.location is not null
    and r.status = 'searching'
    and r.expires_at > now()
    and r.requester_id <> pa.user_id
    and extensions.ST_DWithin(
          r.location,
          pa.location,
          least(r.search_radius_m, pa.service_radius_m)
        );
$$;

-- A provider's inbox: requests they are eligible for and have not answered yet. Returns
-- a bucketed distance and the coarse area label the requester typed, never coordinates.
create function public.nearby_requests()
returns table (
  request_id uuid,
  category_slug text,
  description text,
  scheduled_for timestamptz,
  offered_amount numeric,
  currency text,
  location_label text,
  distance_m integer,
  response_count integer,
  created_at timestamptz,
  expires_at timestamptz,
  requester_display_name text,
  requester_avatar_path text,
  requester_rating_average numeric,
  requester_rating_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.assert_onboarded() as user_id)
  select
    r.id,
    r.category_slug,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(m.distance_m),
    (
      select count(*)::integer from public.request_responses rr
      where rr.request_id = r.id and rr.status = 'pending'
    ),
    r.created_at,
    r.expires_at,
    p.display_name,
    p.avatar_path,
    p.rating_average,
    p.rating_count
  from me
  cross join lateral public.matches(null, me.user_id) m
  join public.requests r on r.id = m.request_id
  join public.profiles p on p.id = r.requester_id
  where not exists (
    select 1 from public.request_responses rr
    where rr.request_id = r.id and rr.provider_id = me.user_id
  )
  order by m.distance_m asc, r.created_at desc;
$$;

-- Responding re-checks eligibility rather than trusting that the caller only ever saw
-- requests from their own inbox.
create function public.respond_to_request(
  p_request_id uuid,
  p_message text default null,
  p_quoted_amount numeric default null,
  p_eta_minutes integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_onboarded();
  v_distance_m double precision;
  v_response_id uuid;
begin
  select m.distance_m into v_distance_m
  -- Positional arguments: a named argument here would collide with this function's own
  -- p_request_id parameter.
  from public.matches(p_request_id, v_user_id) m;

  if v_distance_m is null then
    raise exception 'this request is no longer available to you' using errcode = '55000';
  end if;

  insert into public.request_responses (
    request_id, provider_id, message, quoted_amount, eta_minutes, distance_m
  )
  values (
    p_request_id,
    v_user_id,
    nullif(btrim(p_message), ''),
    p_quoted_amount,
    p_eta_minutes,
    public.bucket_distance_m(v_distance_m)
  )
  returning id into v_response_id;

  return v_response_id;
end;
$$;

create function public.withdraw_response(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_updated uuid;
begin
  update public.request_responses
  set status = 'withdrawn',
      resolved_at = now()
  where id = p_response_id
    and provider_id = v_user_id
    and status = 'pending'
  returning id into v_updated;

  if v_updated is null then
    raise exception 'this response can no longer be withdrawn' using errcode = '55000';
  end if;
end;
$$;

-- What the requester sees before choosing. Provider identity and reputation are
-- released here; the provider's coordinates are not, only how far away they were.
create function public.list_request_responses(p_request_id uuid)
returns table (
  response_id uuid,
  provider_id uuid,
  display_name text,
  avatar_path text,
  bio text,
  rating_average numeric,
  rating_count integer,
  jobs_completed integer,
  message text,
  quoted_amount numeric,
  eta_minutes integer,
  distance_m integer,
  status public.response_status,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    rr.id,
    rr.provider_id,
    p.display_name,
    p.avatar_path,
    p.bio,
    p.rating_average,
    p.rating_count,
    p.jobs_completed,
    rr.message,
    rr.quoted_amount,
    rr.eta_minutes,
    rr.distance_m,
    rr.status,
    rr.created_at
  from public.requests r
  join public.request_responses rr on rr.request_id = r.id
  join public.profiles p on p.id = rr.provider_id
  where r.id = p_request_id
    and r.requester_id = public.assert_authenticated()
    and rr.status in ('pending', 'accepted')
  order by rr.created_at asc;
$$;

-- The moment the privacy boundary moves. Accepting locks the request to one provider,
-- turns every other pending response down, and takes that provider out of matching so
-- they cannot be double-booked.
create function public.accept_response(p_response_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_request_id uuid;
  v_provider_id uuid;
  v_request_status public.request_status;
  v_response_status public.response_status;
begin
  select rr.request_id, rr.provider_id, rr.status
    into v_request_id, v_provider_id, v_response_status
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  where rr.id = p_response_id
    and r.requester_id = v_user_id;

  if v_request_id is null then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  select status into v_request_status
  from public.requests
  where id = v_request_id
  for update;

  if v_request_status <> 'searching' then
    raise exception 'this request is already %', v_request_status using errcode = '55000';
  end if;

  if v_response_status <> 'pending' then
    raise exception 'this response is no longer pending' using errcode = '55000';
  end if;

  update public.request_responses
  set status = 'accepted', resolved_at = now()
  where id = p_response_id;

  update public.request_responses
  set status = 'declined', resolved_at = now()
  where request_id = v_request_id
    and id <> p_response_id
    and status = 'pending';

  update public.requests
  set status = 'accepted',
      accepted_at = now(),
      accepted_response_id = p_response_id,
      provider_id = v_provider_id
  where id = v_request_id;

  update public.provider_availability
  set status = 'busy'
  where user_id = v_provider_id;

  return v_request_id;
end;
$$;

create function public.decline_response(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_updated uuid;
begin
  update public.request_responses rr
  set status = 'declined',
      resolved_at = now()
  where rr.id = p_response_id
    and rr.status = 'pending'
    and exists (
      select 1 from public.requests r
      where r.id = rr.request_id and r.requester_id = v_user_id
    )
  returning rr.id into v_updated;

  if v_updated is null then
    raise exception 'this response is no longer pending' using errcode = '55000';
  end if;
end;
$$;

-- A provider's own outgoing responses, with enough of each request to render a list.
-- Coordinates stay hidden here even for accepted work; the connected screen reads
-- public.get_engagement for that.
create function public.my_responses()
returns table (
  response_id uuid,
  request_id uuid,
  category_slug text,
  description text,
  location_label text,
  distance_m integer,
  scheduled_for timestamptz,
  offered_amount numeric,
  quoted_amount numeric,
  currency text,
  response_status public.response_status,
  request_status public.request_status,
  requester_display_name text,
  requester_avatar_path text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    rr.id,
    r.id,
    r.category_slug,
    r.description,
    r.location_label,
    rr.distance_m,
    r.scheduled_for,
    r.offered_amount,
    rr.quoted_amount,
    r.currency,
    rr.status,
    r.status,
    p.display_name,
    p.avatar_path,
    rr.created_at
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  join public.profiles p on p.id = r.requester_id
  where rr.provider_id = public.assert_authenticated()
  order by rr.created_at desc;
$$;

-- Everything the two parties are allowed to know about each other once the requester
-- has accepted: exact pickup coordinates, the provider's current position if they are
-- still Active, and phone numbers so they can actually reach each other.
--
-- Reachable only by the requester and the accepted provider, and only for a request
-- that has moved past acceptance.
create function public.get_engagement(p_request_id uuid)
returns table (
  request_id uuid,
  category_slug text,
  description text,
  scheduled_for timestamptz,
  offered_amount numeric,
  quoted_amount numeric,
  currency text,
  request_status public.request_status,
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  viewer_is_requester boolean,
  location_label text,
  request_latitude double precision,
  request_longitude double precision,
  provider_latitude double precision,
  provider_longitude double precision,
  counterparty_id uuid,
  counterparty_display_name text,
  counterparty_avatar_path text,
  counterparty_phone text,
  counterparty_rating_average numeric,
  counterparty_rating_count integer,
  rating_stars smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.assert_authenticated() as user_id)
  select
    r.id,
    r.category_slug,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    accepted.quoted_amount,
    r.currency,
    r.status,
    r.accepted_at,
    r.started_at,
    r.completed_at,
    r.requester_id = me.user_id,
    r.location_label,
    extensions.ST_Y(r.location::extensions.geometry),
    extensions.ST_X(r.location::extensions.geometry),
    extensions.ST_Y(pa.location::extensions.geometry),
    extensions.ST_X(pa.location::extensions.geometry),
    counterparty.id,
    counterparty.display_name,
    counterparty.avatar_path,
    counterparty.phone,
    counterparty.rating_average,
    counterparty.rating_count,
    rating.stars
  from me
  join public.requests r
    on r.id = p_request_id
   and r.status in ('accepted', 'in_progress', 'completed')
   and me.user_id in (r.requester_id, r.provider_id)
  join public.profiles counterparty
    on counterparty.id = case when r.requester_id = me.user_id then r.provider_id else r.requester_id end
  left join public.request_responses accepted on accepted.id = r.accepted_response_id
  -- The provider's live position is shared with the requester only, and only while the
  -- provider is still Active. It is never exposed the other way round.
  left join public.provider_availability pa
    on pa.user_id = r.provider_id
   and r.requester_id = me.user_id
   and r.status in ('accepted', 'in_progress')
  left join public.ratings rating on rating.request_id = r.id;
$$;

revoke execute on function public.matches(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.nearby_requests() from public, anon;
revoke execute on function public.respond_to_request(uuid, text, numeric, integer) from public, anon;
revoke execute on function public.withdraw_response(uuid) from public, anon;
revoke execute on function public.list_request_responses(uuid) from public, anon;
revoke execute on function public.accept_response(uuid) from public, anon;
revoke execute on function public.decline_response(uuid) from public, anon;
revoke execute on function public.my_responses() from public, anon;
revoke execute on function public.get_engagement(uuid) from public, anon;

grant execute on function public.nearby_requests() to authenticated;
grant execute on function public.respond_to_request(uuid, text, numeric, integer) to authenticated;
grant execute on function public.withdraw_response(uuid) to authenticated;
grant execute on function public.list_request_responses(uuid) to authenticated;
grant execute on function public.accept_response(uuid) to authenticated;
grant execute on function public.decline_response(uuid) to authenticated;
grant execute on function public.my_responses() to authenticated;
grant execute on function public.get_engagement(uuid) to authenticated;
