-- Provider responses: requester-only visibility for counts, idempotent creation, and
-- richer requester-facing fields without leaking phone numbers.

drop function public.nearby_requests();

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
    where rr.request_id = r.id
      and rr.provider_id = me.user_id
      and rr.status not in ('withdrawn', 'expired')
  )
  order by m.distance_m asc, r.created_at desc;
$$;

revoke execute on function public.nearby_requests() from public, anon;
grant execute on function public.nearby_requests() to authenticated;

drop function public.respond_to_request(uuid, text, numeric, integer, double precision, double precision);

create function public.respond_to_request(
  p_request_id uuid,
  p_message text default null,
  p_quoted_amount numeric default null,
  p_eta_minutes integer default null,
  p_latitude double precision default null,
  p_longitude double precision default null
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
  v_request_expires_at timestamptz;
  v_message text := nullif(btrim(p_message), '');
begin
  if p_latitude is not null and p_longitude is not null then
    update public.provider_availability
    set location = public.assert_coordinates(p_latitude, p_longitude)
    where user_id = v_user_id
      and status = 'available'
      and expires_at > now();
  end if;

  select m.distance_m into v_distance_m
  from public.matches(p_request_id, v_user_id) m;

  if v_distance_m is null then
    raise exception 'this request is no longer available to you' using errcode = '55000';
  end if;

  select r.expires_at into v_request_expires_at
  from public.requests r
  where r.id = p_request_id;

  insert into public.request_responses (
    request_id,
    provider_id,
    message,
    quoted_amount,
    eta_minutes,
    distance_m,
    expires_at
  )
  values (
    p_request_id,
    v_user_id,
    v_message,
    p_quoted_amount,
    p_eta_minutes,
    public.bucket_distance_m(v_distance_m),
    v_request_expires_at
  )
  on conflict (request_id, provider_id) do update
  set message = excluded.message,
      quoted_amount = excluded.quoted_amount,
      eta_minutes = excluded.eta_minutes,
      distance_m = excluded.distance_m,
      expires_at = excluded.expires_at,
      status = 'pending',
      resolved_at = null,
      decline_reason = null
  where request_responses.status in ('pending', 'withdrawn', 'expired')
  returning id into v_response_id;

  if v_response_id is not null then
    return v_response_id;
  end if;

  select rr.id into v_response_id
  from public.request_responses rr
  where rr.request_id = p_request_id
    and rr.provider_id = v_user_id
    and rr.status = 'pending';

  if v_response_id is not null then
    return v_response_id;
  end if;

  raise exception 'this request is no longer available to you' using errcode = '55000';
end;
$$;

revoke execute on function public.respond_to_request(uuid, text, numeric, integer, double precision, double precision) from public, anon;
grant execute on function public.respond_to_request(uuid, text, numeric, integer, double precision, double precision) to authenticated;

drop function public.list_request_responses(uuid);

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
  phone_verified boolean,
  message text,
  quoted_amount numeric,
  eta_minutes integer,
  distance_m integer,
  status public.response_status,
  created_at timestamptz,
  expires_at timestamptz
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
    p.phone is not null as phone_verified,
    rr.message,
    rr.quoted_amount,
    rr.eta_minutes,
    rr.distance_m,
    rr.status,
    rr.created_at,
    rr.expires_at
  from public.requests r
  join public.request_responses rr on rr.request_id = r.id
  join public.profiles p on p.id = rr.provider_id
  left join public.provider_availability pa on pa.user_id = rr.provider_id
  where r.id = p_request_id
    and r.requester_id = public.assert_authenticated()
    and (
      rr.status = 'accepted'
      or (
        rr.status = 'pending'
        and pa.status = 'available'
        and pa.expires_at > now()
        and pa.location is not null
      )
    )
  order by rr.created_at asc;
$$;

revoke execute on function public.list_request_responses(uuid) from public, anon;
grant execute on function public.list_request_responses(uuid) to authenticated;

drop function public.my_responses();

create function public.my_responses()
returns table (
  response_id uuid,
  request_id uuid,
  category_slug text,
  description text,
  category_data jsonb,
  location_label text,
  distance_m integer,
  scheduled_for timestamptz,
  offered_amount numeric,
  quoted_amount numeric,
  currency text,
  message text,
  eta_minutes integer,
  response_status public.response_status,
  request_status public.request_status,
  requester_display_name text,
  requester_avatar_path text,
  created_at timestamptz,
  decline_reason text
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
    r.category_data,
    r.location_label,
    rr.distance_m,
    r.scheduled_for,
    r.offered_amount,
    rr.quoted_amount,
    r.currency,
    rr.message,
    rr.eta_minutes,
    rr.status,
    r.status,
    p.display_name,
    p.avatar_path,
    rr.created_at,
    rr.decline_reason
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  join public.profiles p on p.id = r.requester_id
  where rr.provider_id = public.assert_authenticated()
  order by rr.created_at desc;
$$;

revoke execute on function public.my_responses() from public, anon;
grant execute on function public.my_responses() to authenticated;
