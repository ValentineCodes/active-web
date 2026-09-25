-- A client declining a response is final. The provider cannot answer that request
-- again, so it leaves every nearby list: the public browse and the single-request
-- browse used by the respond screen. The Active inbox already omits any request
-- this provider has answered.

create or replace function public.browse_nearby_requests(
  p_latitude double precision,
  p_longitude double precision,
  p_category_slug text default null
)
returns table (
  request_id uuid,
  category_slug text,
  description text,
  category_data jsonb,
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
    r.category_data,
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
   and not exists (
     select 1 from public.request_responses rr
     where rr.request_id = r.id
       and rr.provider_id = viewer.user_id
       and rr.status = 'declined'
   )
  order by extensions.ST_Distance(r.location, viewer.location) asc, r.created_at desc
  limit 40;
$$;

create or replace function public.browse_request(
  p_request_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  request_id uuid,
  category_slug text,
  description text,
  category_data jsonb,
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
    r.category_data,
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
   and extensions.ST_DWithin(r.location, viewer.location, r.search_radius_m)
   and not exists (
     select 1 from public.request_responses rr
     where rr.request_id = r.id
       and rr.provider_id = viewer.user_id
       and rr.status = 'declined'
   );
$$;
