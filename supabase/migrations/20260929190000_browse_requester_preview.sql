-- Show requester trust signals on public browse (name + rating), not exact location.

drop function if exists public.browse_nearby_requests(double precision, double precision);
drop function if exists public.browse_request(uuid, double precision, double precision);

create function public.browse_nearby_requests(
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  request_id uuid,
  title text,
  description text,
  scheduled_for timestamptz,
  offered_amount numeric,
  currency text,
  location_label text,
  distance_m integer,
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
  with viewer as (
    select
      public.assert_onboarded() as user_id,
      public.assert_coordinates(p_latitude, p_longitude) as location
  )
  select
    r.id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(extensions.ST_Distance(r.location, viewer.location)),
    p.display_name,
    p.avatar_path,
    p.rating_average,
    p.rating_count
  from viewer
  join public.requests r
    on r.status = 'posted'
   and r.expires_at > now()
   and r.requester_id <> viewer.user_id
   and extensions.ST_DWithin(r.location, viewer.location, public.discovery_radius_m())
   and not exists (
     select 1 from public.request_responses rr
     where rr.request_id = r.id
       and rr.responder_id = viewer.user_id
       and rr.status = 'declined'
   )
  join public.profiles p on p.id = r.requester_id
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
  title text,
  description text,
  scheduled_for timestamptz,
  offered_amount numeric,
  currency text,
  location_label text,
  distance_m integer,
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
  with viewer as (
    select
      public.assert_onboarded() as user_id,
      public.assert_coordinates(p_latitude, p_longitude) as location
  )
  select
    r.id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(extensions.ST_Distance(r.location, viewer.location)),
    p.display_name,
    p.avatar_path,
    p.rating_average,
    p.rating_count
  from viewer
  join public.requests r
    on r.id = p_request_id
   and r.status = 'posted'
   and r.expires_at > now()
   and r.requester_id <> viewer.user_id
   and extensions.ST_DWithin(r.location, viewer.location, public.discovery_radius_m())
  join public.profiles p on p.id = r.requester_id;
$$;

grant execute on function public.browse_nearby_requests(double precision, double precision) to authenticated;
grant execute on function public.browse_request(uuid, double precision, double precision) to authenticated;
