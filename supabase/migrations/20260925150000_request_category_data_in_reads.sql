-- Surface category-specific request fields anywhere a request summary is shown.

drop function if exists public.nearby_requests();

create function public.nearby_requests()
returns table (
  request_id uuid,
  category_slug text,
  description text,
  category_data jsonb,
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
    r.category_data,
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

revoke execute on function public.nearby_requests() from public, anon;
grant execute on function public.nearby_requests() to authenticated;

drop function if exists public.browse_nearby_requests(double precision, double precision, text);
drop function if exists public.browse_request(uuid, double precision, double precision);

create function public.browse_nearby_requests(
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
   and extensions.ST_DWithin(r.location, viewer.location, r.search_radius_m);
$$;

revoke execute on function public.browse_nearby_requests(double precision, double precision, text) from public, anon;
revoke execute on function public.browse_request(uuid, double precision, double precision) from public, anon;

grant execute on function public.browse_nearby_requests(double precision, double precision, text) to authenticated;
grant execute on function public.browse_request(uuid, double precision, double precision) to authenticated;

drop function if exists public.get_engagement(uuid);

create function public.get_engagement(p_request_id uuid)
returns table (
  request_id uuid,
  category_slug text,
  description text,
  category_data jsonb,
  scheduled_for timestamptz,
  offered_amount numeric,
  quoted_amount numeric,
  currency text,
  request_status public.request_status,
  payment_status public.payment_status,
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
  rating_stars smallint,
  handshake_id uuid,
  handshake_at timestamptz
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
    r.category_data,
    r.scheduled_for,
    r.offered_amount,
    accepted.quoted_amount,
    r.currency,
    r.status,
    r.payment_status,
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
    rating.stars,
    h.id,
    h.created_at
  from me
  join public.requests r
    on r.id = p_request_id
   and r.status in (
     'accepted',
     'in_progress',
     'completion_pending',
     'completed',
     'disputed',
     'no_show'
   )
   and me.user_id in (r.requester_id, r.provider_id)
  join public.profiles counterparty
    on counterparty.id = case when r.requester_id = me.user_id then r.provider_id else r.requester_id end
  left join public.request_responses accepted on accepted.id = r.accepted_response_id
  left join public.provider_availability pa
    on pa.user_id = r.provider_id
   and r.requester_id = me.user_id
   and r.status in ('accepted', 'in_progress', 'completion_pending')
  left join public.ratings rating on rating.request_id = r.id
  left join public.handshakes h on h.request_id = r.id;
$$;

revoke execute on function public.get_engagement(uuid) from public, anon;
grant execute on function public.get_engagement(uuid) to authenticated;
