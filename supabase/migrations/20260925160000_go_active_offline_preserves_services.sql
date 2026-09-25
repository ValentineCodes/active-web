-- Going offline leaves matching and stops sharing a live position. The last service
-- categories and radius stay, so the next Active session can start from them. Matching
-- still requires status = 'available' and a location, so a stored radius cannot match
-- anyone while the provider is offline.

alter table public.provider_availability
  drop constraint provider_availability_offline_is_clear;

alter table public.provider_availability
  add constraint provider_availability_offline_is_clear check (
    status <> 'offline'
    or (location is null and expires_at is null)
  );

create or replace function public.go_offline()
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

-- A finished job returns the provider to the pool only while their window is still open.
-- A lapsed window goes offline without dropping the services or radius they last chose.
create or replace function public.release_provider(p_provider_id uuid)
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
      went_active_at = case when expires_at > now() then went_active_at else null end,
      expires_at = case when expires_at > now() then expires_at else null end
  where user_id = p_provider_id
    and status = 'busy';
$$;
