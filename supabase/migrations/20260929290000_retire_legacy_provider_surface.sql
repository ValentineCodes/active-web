-- Drop orphaned provider-era functions/types and fix auth bootstrap after table removal.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone)
  on conflict (id) do nothing;

  insert into public.user_attendance (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.wallet_accounts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop function if exists public.go_active(double precision, double precision, integer, text[], integer);
drop function if exists public.go_offline();
drop function if exists public.refresh_availability_location(double precision, double precision);
drop function if exists public.expand_request_radius(uuid);
drop function if exists public.radius_ladder_m();
drop function if exists public.matches(uuid, uuid);
drop function if exists public.redact_discovery_category_data(jsonb);
drop function if exists public.request_has_media_path(jsonb, text);
drop function if exists public.authorize_request_media_read(text, double precision, double precision);

drop table if exists public.request_media_read_grants;

drop view if exists public.my_availability;

drop type if exists public.availability_status;
