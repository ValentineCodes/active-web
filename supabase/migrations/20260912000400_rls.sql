-- Privacy model
-- ─────────────
-- Location awareness does not mean location visibility.
--
-- `requests.location` and `provider_availability.location` hold exact coordinates.
-- No client role may write to the tables that drive matching, and reads are limited to
-- rows the caller is a party to:
--
--   * before acceptance  a provider can only reach a request through the matching
--                        functions, which return a bucketed distance and a coarse area
--                        label and never the geography column;
--   * after acceptance   the accepted provider and the requester can read the row
--                        directly, which is where exact coordinates are released.
--
-- Every state change goes through a security-definer function, so the request lifecycle
-- is enforced in one place instead of being trusted to the client.

alter table public.service_categories enable row level security;
alter table public.profiles enable row level security;
alter table public.requests enable row level security;
alter table public.request_responses enable row level security;
alter table public.provider_availability enable row level security;
alter table public.provider_services enable row level security;
alter table public.ratings enable row level security;
alter table public.push_tokens enable row level security;

revoke all on public.service_categories from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
revoke all on public.requests from anon, authenticated;
revoke all on public.request_responses from anon, authenticated;
revoke all on public.provider_availability from anon, authenticated;
revoke all on public.provider_services from anon, authenticated;
revoke all on public.ratings from anon, authenticated;
revoke all on public.push_tokens from anon, authenticated;

-- Catalogue: readable by any signed-in user, never writable.
grant select on public.service_categories to authenticated;

create policy "categories are readable by signed in users"
  on public.service_categories for select to authenticated
  using (is_active);

-- Profiles: a user reads and edits only their own. Counterparty profiles are released
-- through functions that return a curated subset.
grant select, update on public.profiles to authenticated;

create policy "read own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Requests: readable by the two parties. All writes go through functions.
grant select on public.requests to authenticated;

create policy "parties read the request"
  on public.requests for select to authenticated
  using (
    requester_id = (select auth.uid())
    or provider_id = (select auth.uid())
  );

-- Responses: the responding provider and the request owner can read them, which also
-- lets the requester subscribe to new responses over Realtime.
grant select on public.request_responses to authenticated;

create policy "parties read the response"
  on public.request_responses for select to authenticated
  using (
    provider_id = (select auth.uid())
    or exists (
      select 1 from public.requests r
      where r.id = request_id and r.requester_id = (select auth.uid())
    )
  );

-- Availability: only the owner can see their own coordinates. Nobody else, ever.
grant select on public.provider_availability to authenticated;
grant select on public.provider_services to authenticated;

create policy "read own availability"
  on public.provider_availability for select to authenticated
  using (user_id = (select auth.uid()));

create policy "read own services"
  on public.provider_services for select to authenticated
  using (user_id = (select auth.uid()));

-- Ratings: visible to both people involved. Aggregate reputation reaches everyone else
-- through profiles.rating_average.
grant select on public.ratings to authenticated;

create policy "parties read the rating"
  on public.ratings for select to authenticated
  using (
    rater_id = (select auth.uid())
    or ratee_id = (select auth.uid())
  );

-- Push tokens: fully owned by the user.
grant select, insert, update, delete on public.push_tokens to authenticated;

create policy "manage own push tokens"
  on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
