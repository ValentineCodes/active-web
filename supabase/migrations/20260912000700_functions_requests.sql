-- Request lifecycle. The client never writes to public.requests directly; each
-- transition below is the single authoritative place it can happen.

-- Search radius ladder used when a request finds nobody. Expanding picks the next rung.
create function public.radius_ladder_m()
returns integer[]
language sql
immutable
set search_path = ''
as $$
  select array[2000, 5000, 10000, 20000, 35000, 50000];
$$;

-- Returns a provider to the pool once their engagement ends. If the availability window
-- they signed up for has already passed they go offline and their location is dropped,
-- rather than being silently kept online.
create function public.release_provider(p_provider_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.provider_availability
  set status = case
                 when expires_at > now() then 'available'::public.availability_status
                 else 'offline'::public.availability_status
               end,
      location = case when expires_at > now() then location else null end,
      service_radius_m = case when expires_at > now() then service_radius_m else null end,
      went_active_at = case when expires_at > now() then went_active_at else null end,
      expires_at = case when expires_at > now() then expires_at else null end
  where user_id = p_provider_id
    and status = 'busy';
$$;

create function public.create_request(
  p_category_slug text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_search_radius_m integer,
  p_scheduled_for timestamptz default null,
  p_offered_amount numeric default null
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

  -- Abuse guard: a person genuinely needing help has a handful of open requests, not a
  -- flood of them.
  if (
    select count(*) from public.requests
    where requester_id = v_user_id
      and status in ('searching', 'accepted', 'in_progress')
  ) >= 5 then
    raise exception 'you already have 5 open requests' using errcode = '55000';
  end if;

  insert into public.requests (
    requester_id,
    category_slug,
    description,
    scheduled_for,
    offered_amount,
    location,
    location_label,
    search_radius_m,
    status,
    submitted_at,
    -- A request stops searching 24 hours after the time it is needed.
    expires_at
  )
  values (
    v_user_id,
    p_category_slug,
    btrim(p_description),
    p_scheduled_for,
    p_offered_amount,
    v_location,
    btrim(p_location_label),
    p_search_radius_m,
    'searching',
    now(),
    coalesce(p_scheduled_for, now()) + interval '24 hours'
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

-- Widen the private matching boundary when nobody has responded. This changes who the
-- request is offered to; it does not broadcast the requester's position any further.
create function public.expand_request_radius(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_current integer;
  v_next integer;
begin
  select search_radius_m into v_current
  from public.requests
  where id = p_request_id
    and requester_id = v_user_id
    and status = 'searching'
  for update;

  if v_current is null then
    raise exception 'request is not searching' using errcode = '55000';
  end if;

  select min(rung) into v_next
  from unnest(public.radius_ladder_m()) as rung
  where rung > v_current;

  if v_next is null then
    raise exception 'request is already searching the widest area' using errcode = '55000';
  end if;

  update public.requests
  set search_radius_m = v_next,
      radius_expansions = radius_expansions + 1
  where id = p_request_id;

  return v_next;
end;
$$;

create function public.cancel_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_provider_id uuid;
  v_status public.request_status;
begin
  select status, provider_id into v_status, v_provider_id
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

  if v_provider_id is not null then
    perform public.release_provider(v_provider_id);
  end if;
end;
$$;

-- The requester confirms the service happened. Keeping completion on the side that
-- received the service means the rating prompt follows immediately, and no provider can
-- close out work that was not delivered.
create function public.complete_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_provider_id uuid;
  v_status public.request_status;
begin
  select status, provider_id into v_status, v_provider_id
  from public.requests
  where id = p_request_id and requester_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status not in ('accepted', 'in_progress') then
    raise exception 'only an accepted request can be completed' using errcode = '55000';
  end if;

  update public.requests
  set status = 'completed',
      completed_at = now(),
      started_at = coalesce(started_at, now())
  where id = p_request_id;

  update public.profiles set jobs_completed = jobs_completed + 1 where id = v_provider_id;
  update public.profiles set requests_completed = requests_completed + 1 where id = v_user_id;

  perform public.release_provider(v_provider_id);
end;
$$;

-- The provider marks the point at which they actually begin.
create function public.start_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_status public.request_status;
begin
  select status into v_status
  from public.requests
  where id = p_request_id and provider_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status <> 'accepted' then
    raise exception 'only an accepted request can be started' using errcode = '55000';
  end if;

  update public.requests
  set status = 'in_progress',
      started_at = now()
  where id = p_request_id;
end;
$$;

create function public.rate_request(
  p_request_id uuid,
  p_stars smallint,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_provider_id uuid;
begin
  select provider_id into v_provider_id
  from public.requests
  where id = p_request_id
    and requester_id = v_user_id
    and status = 'completed';

  if v_provider_id is null then
    raise exception 'only a completed request can be rated' using errcode = '55000';
  end if;

  insert into public.ratings (request_id, rater_id, ratee_id, stars, comment)
  values (p_request_id, v_user_id, v_provider_id, p_stars, nullif(btrim(p_comment), ''));
end;
$$;

revoke execute on function public.radius_ladder_m() from public, anon;
revoke execute on function public.release_provider(uuid) from public, anon, authenticated;
revoke execute on function public.create_request(text, text, double precision, double precision, text, integer, timestamptz, numeric) from public, anon;
revoke execute on function public.expand_request_radius(uuid) from public, anon;
revoke execute on function public.cancel_request(uuid) from public, anon;
revoke execute on function public.complete_request(uuid) from public, anon;
revoke execute on function public.start_request(uuid) from public, anon;
revoke execute on function public.rate_request(uuid, smallint, text) from public, anon;

grant execute on function public.radius_ladder_m() to authenticated;
grant execute on function public.create_request(text, text, double precision, double precision, text, integer, timestamptz, numeric) to authenticated;
grant execute on function public.expand_request_radius(uuid) to authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
grant execute on function public.complete_request(uuid) to authenticated;
grant execute on function public.start_request(uuid) to authenticated;
grant execute on function public.rate_request(uuid, smallint, text) to authenticated;
