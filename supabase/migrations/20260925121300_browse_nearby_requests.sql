-- Public discovery. Any onboarded user can browse searching requests near them
-- without going Active. The result is the demand itself: category, description,
-- a coarse area, bucketed distance, timing, and the offered amount.
--
-- Exact coordinates, requester identity, contact details, and response activity
-- are not selected.
--
-- Visibility is the request's own search radius. A browser has no service radius,
-- so the only boundary is the one the requester chose.
--
-- The only relevant public status is `searching`, and only while expires_at is still
-- in the future. Expiry is not always written onto the status column, so both checks
-- are required. Cancelled, accepted, and every later status fail the status check.

create function public.browse_nearby_requests(
  p_latitude double precision,
  p_longitude double precision,
  p_category_slug text default null
)
returns table (
  request_id uuid,
  category_slug text,
  description text,
  scheduled_for timestamptz,
  offered_amount numeric,
  currency text,
  location_label text,
  distance_m integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select
      public.assert_onboarded() as user_id,
      public.assert_coordinates(p_latitude, p_longitude) as location,
      nullif(btrim(p_category_slug), '') as category_slug
  )
  select
    r.id,
    r.category_slug,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(extensions.ST_Distance(r.location, viewer.location))
  from viewer
  join public.requests r
    on r.status = 'searching'
   and r.expires_at > now()
   and r.requester_id <> viewer.user_id
   and (viewer.category_slug is null or r.category_slug = viewer.category_slug)
   and extensions.ST_DWithin(r.location, viewer.location, r.search_radius_m)
  order by extensions.ST_Distance(r.location, viewer.location) asc, r.created_at desc
  limit 40;
$$;

create function public.browse_request(
  p_request_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  request_id uuid,
  category_slug text,
  description text,
  scheduled_for timestamptz,
  offered_amount numeric,
  currency text,
  location_label text,
  distance_m integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select
      public.assert_onboarded() as user_id,
      public.assert_coordinates(p_latitude, p_longitude) as location
  )
  select
    r.id,
    r.category_slug,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(extensions.ST_Distance(r.location, viewer.location))
  from viewer
  join public.requests r
    on r.id = p_request_id
   and r.status = 'searching'
   and r.expires_at > now()
   and r.requester_id <> viewer.user_id
   and extensions.ST_DWithin(r.location, viewer.location, r.search_radius_m);
$$;

revoke execute on function public.browse_nearby_requests(double precision, double precision, text) from public, anon;
revoke execute on function public.browse_request(uuid, double precision, double precision) from public, anon;

grant execute on function public.browse_nearby_requests(double precision, double precision, text) to authenticated;
grant execute on function public.browse_request(uuid, double precision, double precision) to authenticated;
