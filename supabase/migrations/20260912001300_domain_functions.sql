-- Wire domain columns into authoritative lifecycle functions.

create or replace function public.guard_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.phone is distinct from old.phone
      or new.rating_average is distinct from old.rating_average
      or new.rating_count is distinct from old.rating_count
      or new.jobs_completed is distinct from old.jobs_completed
      or new.requests_completed is distinct from old.requests_completed
      or new.avatar_captured_in_app is distinct from old.avatar_captured_in_app
    then
      raise exception 'profile field is server managed and cannot be set by a client'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.guard_request_history_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('completed', 'cancelled', 'expired', 'no_show') then
    if to_jsonb(old) - 'payment_status' = to_jsonb(new) - 'payment_status' then
      return new;
    end if;

    raise exception 'request % is a historical record and cannot be changed', old.id
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop function if exists public.create_request(
  text, text, double precision, double precision, text, integer, timestamptz, numeric
);

create function public.create_request(
  p_category_slug text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_search_radius_m integer,
  p_scheduled_for timestamptz default null,
  p_offered_amount numeric default null,
  p_category_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_onboarded();
  v_location extensions.geography := public.assert_coordinates(p_latitude, p_longitude);
  v_request_id uuid;
  v_payment public.payment_status;
begin
  if not exists (
    select 1 from public.service_categories
    where slug = p_category_slug and is_active
  ) then
    raise exception 'unknown service category' using errcode = '22023';
  end if;

  if p_search_radius_m not between 1000 and 50000 then
    raise exception 'search radius must be between 1 km and 50 km' using errcode = '22023';
  end if;

  if p_scheduled_for is not null and p_scheduled_for < now() - interval '5 minutes' then
    raise exception 'scheduled time is in the past' using errcode = '22023';
  end if;

  if p_scheduled_for is not null and p_scheduled_for > now() + interval '30 days' then
    raise exception 'scheduled time is too far in the future' using errcode = '22023';
  end if;

  if jsonb_typeof(p_category_data) is distinct from 'object' then
    raise exception 'category data must be a JSON object' using errcode = '22023';
  end if;

  if (
    select count(*) from public.requests
    where requester_id = v_user_id
      and status in ('searching', 'accepted', 'in_progress', 'completion_pending')
  ) >= 5 then
    raise exception 'you already have 5 open requests' using errcode = '55000';
  end if;

  if p_offered_amount is not null and p_offered_amount > 0 then
    v_payment := 'locked';
  else
    v_payment := 'not_required';
  end if;

  insert into public.requests (
    requester_id,
    category_slug,
    description,
    category_data,
    scheduled_for,
    offered_amount,
    payment_status,
    location,
    location_label,
    search_radius_m,
    status,
    submitted_at,
    expires_at
  )
  values (
    v_user_id,
    p_category_slug,
    btrim(p_description),
    p_category_data,
    p_scheduled_for,
    p_offered_amount,
    v_payment,
    v_location,
    btrim(p_location_label),
    p_search_radius_m,
    'searching',
    now(),
    coalesce(p_scheduled_for, now()) + interval '24 hours'
  )
  returning id into v_request_id;

  if v_payment = 'locked' then
    insert into public.payment_transitions (request_id, idempotency_key, from_status, to_status)
    values (v_request_id, 'create:' || v_request_id::text, 'not_required', 'locked');
  end if;

  return v_request_id;
end;
$$;

revoke execute on function public.create_request(
  text, text, double precision, double precision, text, integer, timestamptz, numeric, jsonb
) from public, anon;
grant execute on function public.create_request(
  text, text, double precision, double precision, text, integer, timestamptz, numeric, jsonb
) to authenticated;

create or replace function public.respond_to_request(
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
  v_request_expires_at timestamptz;
begin
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
    nullif(btrim(p_message), ''),
    p_quoted_amount,
    p_eta_minutes,
    public.bucket_distance_m(v_distance_m),
    v_request_expires_at
  )
  returning id into v_response_id;

  return v_response_id;
end;
$$;

create or replace function public.accept_response(p_response_id uuid)
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
  v_requester_id uuid;
  v_payment public.payment_status;
begin
  select rr.request_id, rr.provider_id, rr.status, r.requester_id
    into v_request_id, v_provider_id, v_response_status, v_requester_id
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  where rr.id = p_response_id
    and r.requester_id = v_user_id;

  if v_request_id is null then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  select status, payment_status into v_request_status, v_payment
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

  insert into public.handshakes (request_id, response_id, requester_id, provider_id)
  values (v_request_id, p_response_id, v_requester_id, v_provider_id);

  if v_payment = 'locked' then
    perform public.apply_payment_transition(
      v_request_id,
      'pending',
      'handshake:' || v_request_id::text
    );
  end if;

  update public.provider_availability
  set status = 'busy'
  where user_id = v_provider_id;

  return v_request_id;
end;
$$;

create or replace function public.cancel_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_provider_id uuid;
  v_status public.request_status;
  v_payment public.payment_status;
begin
  select status, provider_id, payment_status
    into v_status, v_provider_id, v_payment
  from public.requests
  where id = p_request_id and requester_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status not in ('draft', 'searching', 'accepted') then
    raise exception 'a request cannot be cancelled once it is %', v_status using errcode = '55000';
  end if;

  update public.request_responses
  set status = case when status = 'accepted' then 'declined'::public.response_status
                    else 'expired'::public.response_status end,
      resolved_at = now()
  where request_id = p_request_id
    and status in ('pending', 'accepted');

  update public.requests
  set status = 'cancelled',
      cancelled_at = now(),
      provider_id = null,
      accepted_response_id = null
  where id = p_request_id;

  if v_payment in ('locked', 'pending') then
    perform public.apply_payment_transition(
      p_request_id,
      'refunded',
      'cancel:' || p_request_id::text
    );
  end if;

  if v_provider_id is not null then
    perform public.release_provider(v_provider_id);
  end if;
end;
$$;

create or replace function public.complete_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_provider_id uuid;
  v_status public.request_status;
  v_payment public.payment_status;
begin
  select status, provider_id, payment_status
    into v_status, v_provider_id, v_payment
  from public.requests
  where id = p_request_id and requester_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status not in ('accepted', 'in_progress', 'completion_pending') then
    raise exception 'only an accepted request can be completed' using errcode = '55000';
  end if;

  update public.requests
  set status = 'completed',
      completed_at = now(),
      started_at = coalesce(started_at, now())
  where id = p_request_id;

  if v_payment = 'pending' then
    perform public.apply_payment_transition(
      p_request_id,
      'released',
      'complete:' || p_request_id::text
    );
  end if;

  update public.profiles set jobs_completed = jobs_completed + 1 where id = v_provider_id;
  update public.profiles set requests_completed = requests_completed + 1 where id = v_user_id;

  perform public.release_provider(v_provider_id);
end;
$$;

create or replace function public.go_active(
  p_latitude double precision,
  p_longitude double precision,
  p_service_radius_m integer,
  p_categories text[],
  p_duration_minutes integer default 240
)
returns public.my_availability
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_onboarded();
  v_location extensions.geography := public.assert_coordinates(p_latitude, p_longitude);
  v_row public.my_availability;
  v_avatar_path text;
  v_avatar_captured boolean;
begin
  select avatar_path, avatar_captured_in_app
    into v_avatar_path, v_avatar_captured
  from public.profiles
  where id = v_user_id;

  if v_avatar_path is null or not v_avatar_captured then
    raise exception 'capture a profile photo in the app before going Active' using errcode = '55000';
  end if;

  if coalesce(array_length(p_categories, 1), 0) = 0 then
    raise exception 'choose at least one service you can provide' using errcode = '22023';
  end if;

  if p_service_radius_m not between 1000 and 50000 then
    raise exception 'service radius must be between 1 km and 50 km' using errcode = '22023';
  end if;

  if p_duration_minutes not between 30 and 720 then
    raise exception 'availability must last between 30 minutes and 12 hours' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_categories) as requested(slug)
    where not exists (
      select 1 from public.service_categories c
      where c.slug = requested.slug and c.is_active
    )
  ) then
    raise exception 'unknown service category' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.provider_availability
    where user_id = v_user_id and status = 'busy'
  ) then
    raise exception 'finish your current job before changing availability' using errcode = '55000';
  end if;

  delete from public.provider_services where user_id = v_user_id;

  insert into public.provider_services (user_id, category_slug)
  select v_user_id, slug from unnest(p_categories) as slug;

  insert into public.provider_availability as pa (
    user_id, status, location, service_radius_m, went_active_at, expires_at
  )
  values (
    v_user_id,
    'available',
    v_location,
    p_service_radius_m,
    now(),
    now() + make_interval(mins => p_duration_minutes)
  )
  on conflict (user_id) do update
  set status = 'available',
      location = excluded.location,
      service_radius_m = excluded.service_radius_m,
      went_active_at = excluded.went_active_at,
      expires_at = excluded.expires_at;

  select * into v_row from public.my_availability where user_id = v_user_id;
  return v_row;
end;
$$;

create or replace function public.confirm_avatar_capture(p_storage_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
begin
  if p_storage_path is null or btrim(p_storage_path) = '' then
    raise exception 'storage path is required' using errcode = '22023';
  end if;

  if (storage.foldername(p_storage_path))[1] is distinct from v_user_id::text then
    raise exception 'avatar path must live under your user folder' using errcode = '42501';
  end if;

  update public.profiles
  set avatar_path = p_storage_path,
      avatar_captured_in_app = true
  where id = v_user_id;
end;
$$;

revoke execute on function public.confirm_avatar_capture(text) from public, anon;
grant execute on function public.confirm_avatar_capture(text) to authenticated;

drop view if exists public.my_requests;

create view public.my_requests
with (security_invoker = on) as
select
  r.id as request_id,
  r.category_slug,
  r.description,
  r.category_data,
  r.scheduled_for,
  r.offered_amount,
  r.currency,
  r.payment_status,
  r.location_label,
  extensions.ST_Y(r.location::extensions.geometry) as latitude,
  extensions.ST_X(r.location::extensions.geometry) as longitude,
  r.search_radius_m,
  r.radius_expansions,
  case
    when r.status = 'searching' and r.expires_at <= now() then 'expired'::public.request_status
    else r.status
  end as status,
  r.provider_id,
  r.source_request_id,
  (
    select count(*)::integer from public.request_responses rr
    where rr.request_id = r.id and rr.status = 'pending'
  ) as pending_response_count,
  exists (select 1 from public.ratings g where g.request_id = r.id) as is_rated,
  r.created_at,
  r.submitted_at,
  r.expires_at,
  r.accepted_at,
  r.started_at,
  r.completed_at,
  r.cancelled_at
from public.requests r
where r.requester_id = (select auth.uid());

revoke all on public.my_requests from public, anon;
grant select on public.my_requests to authenticated;

drop function if exists public.get_engagement(uuid);

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
