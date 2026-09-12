-- Going Active is the only moment a provider's location enters the system, and it is
-- stored solely so the matching functions can run. Nobody can read it but the owner,
-- and even the owner reads it back through this view, which reports availability
-- without the geography column.
--
-- Availability lapses on its own so a forgotten session stops receiving requests. The
-- matching functions filter on expires_at, and this view reports the same effective
-- state to the UI without needing a scheduled job.
create view public.my_availability
with (security_invoker = on) as
select
  pa.user_id,
  case
    when pa.status <> 'offline' and pa.expires_at <= now() then 'offline'::public.availability_status
    else pa.status
  end as status,
  pa.service_radius_m,
  pa.went_active_at,
  pa.expires_at,
  pa.updated_at,
  coalesce(
    array(
      select ps.category_slug
      from public.provider_services ps
      where ps.user_id = pa.user_id
      order by ps.category_slug
    ),
    '{}'::text[]
  ) as category_slugs
from public.provider_availability pa;

revoke all on public.my_availability from public, anon;
grant select on public.my_availability to authenticated;

create function public.go_active(
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
begin
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

create function public.go_offline()
returns public.my_availability
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_updated uuid;
  v_row public.my_availability;
begin
  update public.provider_availability
  set status = 'offline',
      location = null,
      service_radius_m = null,
      expires_at = null,
      went_active_at = null
  where user_id = v_user_id
    and status <> 'busy'
  returning user_id into v_updated;

  if v_updated is null then
    raise exception 'finish your current job before going offline' using errcode = '55000';
  end if;

  select * into v_row from public.my_availability where user_id = v_user_id;
  return v_row;
end;
$$;

-- Called while the provider moves so matching keeps using a current position. The
-- selected services, radius and expiry are untouched.
create function public.refresh_availability_location(
  p_latitude double precision,
  p_longitude double precision
)
returns public.my_availability
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_location extensions.geography := public.assert_coordinates(p_latitude, p_longitude);
  v_updated uuid;
  v_row public.my_availability;
begin
  update public.provider_availability
  set location = v_location
  where user_id = v_user_id
    and (status = 'busy' or (status = 'available' and expires_at > now()))
  returning user_id into v_updated;

  if v_updated is null then
    raise exception 'you are not currently Active' using errcode = '55000';
  end if;

  select * into v_row from public.my_availability where user_id = v_user_id;
  return v_row;
end;
$$;

revoke execute on function public.go_active(double precision, double precision, integer, text[], integer) from public, anon;
revoke execute on function public.go_offline() from public, anon;
revoke execute on function public.refresh_availability_location(double precision, double precision) from public, anon;

grant execute on function public.go_active(double precision, double precision, integer, text[], integer) to authenticated;
grant execute on function public.go_offline() to authenticated;
grant execute on function public.refresh_availability_location(double precision, double precision) to authenticated;
