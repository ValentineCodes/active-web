-- Service catalogue. A table (not an enum) so adding a category is an insert, not a
-- type migration, and so both clients render labels/icons from one source of truth.
create table public.service_categories (
  slug text primary key,
  label text not null,
  tagline text not null,
  icon text not null,
  sort_order integer not null,
  is_active boolean not null default true
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Null until onboarding is finished; the app routes to profile setup while it is null.
  display_name text check (char_length(btrim(display_name)) between 2 and 60),
  avatar_path text,
  -- Mirrored from auth.users so it can be released to a counterparty after acceptance.
  -- Never exposed by any pre-acceptance view or function.
  phone text,
  bio text check (char_length(bio) <= 280),
  rating_average numeric(3, 2),
  rating_count integer not null default 0,
  jobs_completed integer not null default 0,
  requests_completed integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  category_slug text not null references public.service_categories (slug),
  description text not null check (char_length(btrim(description)) between 10 and 1000),
  -- Null means "as soon as possible".
  scheduled_for timestamptz,
  offered_amount numeric(12, 2) check (offered_amount >= 0),
  currency text not null default 'NGN' check (char_length(currency) = 3),
  -- Exact coordinates. Readable only by the requester and, after acceptance, the
  -- accepted provider. Providers discover requests through matching functions that
  -- return distance and a coarse label instead of this column.
  location extensions.geography (Point, 4326) not null,
  -- Coarse, human-entered area shown before acceptance, e.g. "Yaba, Lagos".
  location_label text not null check (char_length(btrim(location_label)) between 2 and 120),
  search_radius_m integer not null check (search_radius_m between 1000 and 50000),
  radius_expansions integer not null default 0,
  status public.request_status not null default 'draft',
  accepted_response_id uuid,
  -- Denormalised from the accepted response so RLS policies and job queries stay simple.
  -- Written only by public.accept_response.
  provider_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint requests_requester_is_not_provider check (provider_id is distinct from requester_id),
  constraint requests_accepted_has_provider check (
    (status in ('accepted', 'in_progress', 'completed')) = (provider_id is not null)
  )
);

create table public.request_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  provider_id uuid not null references public.profiles (id) on delete cascade,
  message text check (char_length(btrim(message)) <= 500),
  -- Optional counter-offer to the requester's offered amount.
  quoted_amount numeric(12, 2) check (quoted_amount >= 0),
  eta_minutes integer check (eta_minutes between 1 and 1440),
  -- Straight-line distance at response time, kept so the requester sees how far the
  -- provider was without either side exposing coordinates.
  distance_m integer not null check (distance_m >= 0),
  status public.response_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (request_id, provider_id)
);

alter table public.requests
  add constraint requests_accepted_response_fkey
  foreign key (accepted_response_id) references public.request_responses (id) on delete set null;

-- Current availability, one row per user. Availability history is not part of the MVP.
create table public.provider_availability (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status public.availability_status not null default 'offline',
  -- Only populated while the user is available or busy; cleared on going offline.
  location extensions.geography (Point, 4326),
  service_radius_m integer check (service_radius_m between 1000 and 50000),
  went_active_at timestamptz,
  -- Availability auto-lapses so a forgotten session stops receiving requests.
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint provider_availability_offline_is_clear check (
    status <> 'offline'
    or (location is null and service_radius_m is null and expires_at is null)
  ),
  constraint provider_availability_online_is_complete check (
    status = 'offline'
    or (location is not null and service_radius_m is not null and expires_at is not null)
  )
);

-- Categories the user can currently serve. Rewritten each time they go Active.
create table public.provider_services (
  user_id uuid not null references public.profiles (id) on delete cascade,
  category_slug text not null references public.service_categories (slug),
  primary key (user_id, category_slug)
);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  -- One rating per request: the requester rates the provider they accepted.
  request_id uuid not null unique references public.requests (id) on delete cascade,
  rater_id uuid not null references public.profiles (id) on delete cascade,
  ratee_id uuid not null references public.profiles (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text check (char_length(btrim(comment)) <= 500),
  created_at timestamptz not null default now()
);

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

-- Matching hot path: "searching requests near this point in this category".
create index requests_matching_idx
  on public.requests using gist (location)
  where status = 'searching';

create index requests_status_category_idx on public.requests (status, category_slug);
create index requests_requester_idx on public.requests (requester_id, created_at desc);
create index requests_provider_idx on public.requests (provider_id, created_at desc);

create index provider_availability_location_idx
  on public.provider_availability using gist (location)
  where status = 'available';

create index request_responses_request_idx on public.request_responses (request_id, created_at desc);
create index request_responses_provider_idx on public.request_responses (provider_id, created_at desc);
create index push_tokens_user_idx on public.push_tokens (user_id);
create index ratings_ratee_idx on public.ratings (ratee_id);
