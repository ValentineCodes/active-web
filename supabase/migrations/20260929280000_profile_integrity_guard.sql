-- Block client-side avatar path tampering (in-app capture flag was already guarded).

create or replace function public.guard_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.phone is distinct from old.phone
      or new.avatar_path is distinct from old.avatar_path
      or new.avatar_captured_in_app is distinct from old.avatar_captured_in_app
      or new.rating_average is distinct from old.rating_average
      or new.rating_count is distinct from old.rating_count
      or new.jobs_completed is distinct from old.jobs_completed
      or new.requests_completed is distinct from old.requests_completed then
      raise exception 'profile field is server managed and cannot be set by a client'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_trust_columns on public.profiles;
drop function if exists public.guard_profile_trust_columns();
