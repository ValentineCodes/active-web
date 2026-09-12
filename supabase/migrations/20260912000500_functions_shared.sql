-- Shared guards used by every authoritative function below.

create function public.assert_authenticated()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return v_user_id;
end;
$$;

-- Participating in the marketplace requires a finished profile, because both sides are
-- shown who they are dealing with before they commit.
create function public.assert_onboarded()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
begin
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and display_name is not null
  ) then
    raise exception 'finish setting up your profile first' using errcode = '42501';
  end if;

  return v_user_id;
end;
$$;

create function public.assert_coordinates(p_latitude double precision, p_longitude double precision)
returns extensions.geography
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'coordinates are out of range' using errcode = '22023';
  end if;

  return extensions.ST_SetSRID(extensions.ST_MakePoint(p_longitude, p_latitude), 4326)::extensions.geography;
end;
$$;

-- Distances shown before acceptance are rounded to the nearest 100 m and floored at
-- 100 m. Bearing is never exposed, so repeated readings cannot be trilaterated back
-- into a coordinate.
create function public.bucket_distance_m(p_distance_m double precision)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(100, (round(p_distance_m / 100.0) * 100))::integer;
$$;

revoke execute on function public.assert_authenticated() from public, anon;
revoke execute on function public.assert_onboarded() from public, anon;
revoke execute on function public.assert_coordinates(double precision, double precision) from public, anon;
revoke execute on function public.bucket_distance_m(double precision) from public, anon;
