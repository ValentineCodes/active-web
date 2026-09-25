-- Public discovery. Any onboarded user can browse searching requests near them
-- without going Active. The result is the demand itself: category, description,
-- a coarse area, bucketed distance, timing, and the offered amount.
--
-- Exact coordinates, requester identity, contact details, and response activity
-- are not selected.

create function public.browse_nearby_requests(
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
    on r.status = 'searching'
   and r.expires_at > now()
   and r.requester_id <> viewer.user_id
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
  select
    found.request_id,
    found.category_slug,
    found.description,
    found.scheduled_for,
    found.offered_amount,
    found.currency,
    found.location_label,
    found.distance_m
  from public.browse_nearby_requests(p_latitude, p_longitude) found
  where found.request_id = p_request_id;
$$;

revoke execute on function public.browse_nearby_requests(double precision, double precision) from public, anon;
revoke execute on function public.browse_request(uuid, double precision, double precision) from public, anon;

grant execute on function public.browse_nearby_requests(double precision, double precision) to authenticated;
grant execute on function public.browse_request(uuid, double precision, double precision) to authenticated;
