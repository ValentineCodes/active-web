-- Every auth user gets a profile shell immediately. display_name stays null until the
-- user finishes onboarding, which is what the app gates the onboarding route on.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone)
  on conflict (id) do nothing;

  insert into public.provider_availability (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger provider_availability_touch_updated_at
  before update on public.provider_availability
  for each row execute function public.touch_updated_at();

-- Users may edit their own name/avatar/bio. Reputation, phone and counters are derived
-- server state, so an attempt to change them is a contract violation, not something to
-- silently ignore.
create function public.guard_profile_columns()
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
    then
      raise exception 'profile field is server managed and cannot be set by a client'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_guard_columns
  before update on public.profiles
  for each row execute function public.guard_profile_columns();

-- Keep the rated user's aggregate in step with the ratings table.
create function public.apply_rating_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p
  set rating_count = agg.count,
      rating_average = agg.average
  from (
    select count(*)::integer as count, round(avg(stars), 2) as average
    from public.ratings
    where ratee_id = new.ratee_id
  ) agg
  where p.id = new.ratee_id;

  return new;
end;
$$;

create trigger ratings_apply_to_profile
  after insert on public.ratings
  for each row execute function public.apply_rating_to_profile();
