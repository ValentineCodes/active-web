-- Simplified Active domain: no categories, no provider availability sessions, no user radii.
-- One account; responses are non-committing; explicit user_attendance for one active job.
-- (Enum value `posted` is added in 20260929110000_add_posted_status.sql.)

-- ── Drop dependent views ─────────────────────────────────────────────────────

drop function if exists public.go_active(double precision, double precision, integer, text[], integer);
drop function if exists public.go_offline();
drop function if exists public.refresh_availability_location(double precision, double precision);

drop view if exists public.my_availability;
drop view if exists public.my_requests;

-- ── Requests: title, optional description, no category/radius ─────────────────

alter table public.requests drop constraint if exists requests_category_slug_fkey;
alter table public.requests drop constraint if exists requests_requester_is_not_provider;
alter table public.requests drop constraint if exists requests_accepted_has_provider;

alter table public.requests
  add column if not exists title text,
  add column if not exists updated_at timestamptz not null default now();

update public.requests
set title = left(btrim(description), 120)
where title is null;

update public.requests
set title = 'Request'
where title is null or btrim(title) = '';

alter table public.requests
  alter column title set not null;

alter table public.requests
  drop column if exists category_slug,
  drop column if exists category_data,
  drop column if exists search_radius_m,
  drop column if exists radius_expansions;

alter table public.requests
  alter column description drop not null;

alter table public.requests
  rename column provider_id to selected_user_id;

alter table public.requests
  add constraint requests_title_length check (char_length(btrim(title)) between 3 and 120),
  add constraint requests_description_length check (
    description is null or char_length(btrim(description)) between 1 and 1000
  ),
  add constraint requests_requester_is_not_selected check (
    selected_user_id is distinct from requester_id
  ),
  add constraint requests_accepted_has_selected check (
    (
      status in (
        'accepted',
        'in_progress',
        'completion_pending',
        'completed',
        'disputed',
        'no_show'
      )
    ) = (selected_user_id is not null)
  );

update public.requests set status = 'posted' where status = 'searching';

create trigger requests_touch_updated_at
  before update on public.requests
  for each row execute function public.touch_updated_at();

drop index if exists public.requests_status_category_idx;
drop index if exists public.requests_matching_idx;

create index requests_matching_idx
  on public.requests using gist (location)
  where status = 'posted';

create index requests_status_posted_idx on public.requests (status)
  where status = 'posted';

-- ── Responses: responder, no eta ─────────────────────────────────────────────

alter table public.request_responses drop constraint if exists request_responses_request_id_provider_id_key;

alter table public.request_responses
  rename column provider_id to responder_id;

alter table public.request_responses
  drop column if exists eta_minutes;

alter table public.request_responses
  add constraint request_responses_one_per_user unique (request_id, responder_id);

create index request_responses_responder_idx
  on public.request_responses (responder_id, created_at desc);

-- ── Handshakes ────────────────────────────────────────────────────────────────

alter table public.handshakes
  rename column provider_id to selected_user_id;

drop index if exists public.handshakes_provider_idx;
create index handshakes_selected_user_idx
  on public.handshakes (selected_user_id, created_at desc);

-- ── Explicit attendance (one active job per user) ─────────────────────────────

create table public.user_attendance (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  request_id uuid references public.requests (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index user_attendance_request_idx on public.user_attendance (request_id)
  where request_id is not null;

insert into public.user_attendance (user_id, request_id)
select pa.user_id, pa.committed_request_id
from public.provider_availability pa
where pa.committed_request_id is not null
on conflict (user_id) do update
set request_id = excluded.request_id;

insert into public.user_attendance (user_id)
select p.id
from public.profiles p
where not exists (select 1 from public.user_attendance ua where ua.user_id = p.id)
on conflict do nothing;

alter table public.user_attendance enable row level security;

revoke all on public.user_attendance from anon;
grant select on public.user_attendance to authenticated;

create policy user_attendance_select_own
  on public.user_attendance for select to authenticated
  using (user_id = (select auth.uid()));

create trigger user_attendance_touch_updated_at
  before update on public.user_attendance
  for each row execute function public.touch_updated_at();

-- ── Retire provider availability / services / categories ──────────────────────

drop trigger if exists provider_availability_touch_updated_at on public.provider_availability;

drop table if exists public.provider_services;
drop table if exists public.provider_availability;

drop table if exists public.service_categories;

-- ── Shared helpers ────────────────────────────────────────────────────────────

create or replace function public.discovery_radius_m()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 50000;
$$;

create or replace function public.open_request_statuses()
returns public.request_status[]
language sql
immutable
set search_path = ''
as $$
  select array['posted']::public.request_status[];
$$;

create or replace function public.attending_request_statuses()
returns public.request_status[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'accepted',
    'in_progress',
    'completion_pending',
    'disputed'
  ]::public.request_status[];
$$;

-- Distance-aware respond check (viewer position optional for listing only).
create or replace function public.request_open_to_user(
  p_request_id uuid,
  p_user_id uuid,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_distance_m double precision;
  v_attending uuid;
  v_viewer extensions.geography;
begin
  if exists (
    select 1 from public.requests r
    where r.id = p_request_id and r.requester_id = p_user_id
  ) then
    return null;
  end if;

  select ua.request_id into v_attending
  from public.user_attendance ua
  where ua.user_id = p_user_id;

  if v_attending is not null and v_attending <> p_request_id then
    return null;
  end if;

  if p_latitude is not null and p_longitude is not null then
    v_viewer := public.assert_coordinates(p_latitude, p_longitude);
  end if;

  select public.bucket_distance_m(extensions.ST_Distance(r.location, v_viewer))
  into v_distance_m
  from public.requests r
  where r.id = p_request_id
    and r.status = 'posted'
    and r.expires_at > now()
    and (
      v_viewer is null
      or extensions.ST_DWithin(r.location, v_viewer, public.discovery_radius_m())
    );

  return v_distance_m;
end;
$$;

create or replace function public.set_user_attendance(p_user_id uuid, p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_attendance (user_id, request_id)
  values (p_user_id, p_request_id)
  on conflict (user_id) do update
  set request_id = excluded.request_id;
end;
$$;

create or replace function public.clear_user_attendance(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.user_attendance
  set request_id = null
  where user_id = p_user_id;
end;
$$;

create or replace function public.release_provider(p_provider_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.clear_user_attendance(p_provider_id);
$$;

-- ── Auth bootstrap ────────────────────────────────────────────────────────────

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

  return new;
end;
$$;

-- ── Views ─────────────────────────────────────────────────────────────────────

create view public.my_requests
with (security_invoker = on) as
select
  r.id as request_id,
  r.title,
  r.description,
  r.scheduled_for,
  r.offered_amount,
  r.currency,
  r.payment_status,
  r.location_label,
  extensions.ST_Y(r.location::extensions.geometry) as latitude,
  extensions.ST_X(r.location::extensions.geometry) as longitude,
  case
    when r.status = 'posted' and r.expires_at <= now() then 'expired'::public.request_status
    else r.status
  end as status,
  r.selected_user_id,
  r.source_request_id,
  (
    select count(*)::integer from public.request_responses rr
    where rr.request_id = r.id and rr.status = 'pending'
  ) as pending_response_count,
  exists (select 1 from public.ratings g where g.request_id = r.id) as is_rated,
  r.created_at,
  r.updated_at,
  r.submitted_at,
  r.expires_at,
  r.accepted_at,
  r.started_at,
  r.completed_at,
  r.cancelled_at
from public.requests r
where r.requester_id = (select auth.uid());

grant select on public.my_requests to authenticated;

create view public.my_attendance
with (security_invoker = on) as
select
  ua.user_id,
  ua.request_id as attending_request_id,
  ua.updated_at
from public.user_attendance ua
where ua.user_id = (select auth.uid());

grant select on public.my_attendance to authenticated;

drop function if exists public.matches(uuid, uuid);
drop function if exists public.expand_request_radius(uuid);
drop function if exists public.radius_ladder_m();

drop function if exists public.create_request(
  text, text, double precision, double precision, text, integer, timestamptz, numeric, jsonb, uuid
);
drop function if exists public.create_request(
  text, text, double precision, double precision, text, integer, timestamptz, numeric, jsonb
);
drop function if exists public.create_request(
  text, text, double precision, double precision, text, integer, timestamptz, numeric
);

drop function if exists public.browse_nearby_requests(double precision, double precision, text);
drop function if exists public.browse_request(uuid, double precision, double precision);

drop function if exists public.respond_to_request(uuid, text, numeric, integer, double precision, double precision);
drop function if exists public.respond_to_request(uuid, text, numeric, integer);
drop function if exists public.respond_to_request(uuid, text, numeric);

-- ── RLS: party columns renamed ────────────────────────────────────────────────

drop policy if exists "parties read the request" on public.requests;
create policy "parties read the request"
  on public.requests for select to authenticated
  using (
    requester_id = (select auth.uid())
    or selected_user_id = (select auth.uid())
  );

drop policy if exists "parties read the response" on public.request_responses;
create policy "parties read the response"
  on public.request_responses for select to authenticated
  using (
    responder_id = (select auth.uid())
    or exists (
      select 1 from public.requests r
      where r.id = request_id and r.requester_id = (select auth.uid())
    )
  );

drop policy if exists "parties read handshake" on public.handshakes;
create policy "parties read handshake"
  on public.handshakes for select to authenticated
  using (
    requester_id = (select auth.uid())
    or selected_user_id = (select auth.uid())
  );

-- ── create_request ────────────────────────────────────────────────────────────

create function public.create_request(
  p_title text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_scheduled_for timestamptz default null,
  p_offered_amount numeric default null,
  p_source_request_id uuid default null
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
  v_source public.requests%rowtype;
begin
  if char_length(btrim(p_title)) < 3 or char_length(btrim(p_title)) > 120 then
    raise exception 'title must be between 3 and 120 characters' using errcode = '22023';
  end if;

  if p_description is not null and btrim(p_description) = '' then
    raise exception 'description cannot be blank' using errcode = '22023';
  end if;

  if p_offered_amount is null or p_offered_amount <= 0 then
    raise exception 'offer amount must be greater than zero' using errcode = '22023';
  end if;

  if p_scheduled_for is not null and p_scheduled_for < now() - interval '5 minutes' then
    raise exception 'scheduled time is in the past' using errcode = '22023';
  end if;

  if p_scheduled_for is not null and p_scheduled_for > now() + interval '30 days' then
    raise exception 'scheduled time is too far in the future' using errcode = '22023';
  end if;

  if p_source_request_id is not null then
    select * into v_source
    from public.requests
    where id = p_source_request_id and requester_id = v_user_id;

    if v_source.id is null then
      raise exception 'source request not found' using errcode = 'P0002';
    end if;

    if not (
      v_source.status = 'completed'
      or v_source.status = 'expired'
      or (v_source.status = 'posted' and v_source.expires_at <= now())
    ) then
      raise exception 'only expired or completed requests can be reused' using errcode = '55000';
    end if;
  end if;

  if (
    select count(*) from public.requests
    where requester_id = v_user_id
      and (
        status in ('accepted', 'in_progress', 'completion_pending')
        or (status = 'posted' and expires_at > now())
      )
  ) >= 5 then
    raise exception 'you already have 5 open requests' using errcode = '55000';
  end if;

  v_payment := 'locked';

  insert into public.requests (
    requester_id,
    title,
    description,
    scheduled_for,
    offered_amount,
    payment_status,
    location,
    location_label,
    status,
    submitted_at,
    expires_at,
    source_request_id
  )
  values (
    v_user_id,
    btrim(p_title),
    nullif(btrim(p_description), ''),
    p_scheduled_for,
    p_offered_amount,
    v_payment,
    v_location,
    btrim(p_location_label),
    'posted',
    now(),
    coalesce(p_scheduled_for, now()) + interval '24 hours',
    p_source_request_id
  )
  returning id into v_request_id;

  perform public.lock_request_escrow(v_request_id, 'create:' || v_request_id::text);

  return v_request_id;
end;
$$;

grant execute on function public.create_request(
  text, text, double precision, double precision, text, timestamptz, numeric, uuid
) to authenticated;

-- ── Public browse (no Active session required) ────────────────────────────────

create function public.browse_nearby_requests(
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  request_id uuid,
  title text,
  description text,
  scheduled_for timestamptz,
  offered_amount numeric,
  currency text,
  location_label text,
  distance_m integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select
      public.assert_onboarded() as user_id,
      public.assert_coordinates(p_latitude, p_longitude) as location
  )
  select
    r.id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(extensions.ST_Distance(r.location, viewer.location))
  from viewer
  join public.requests r
    on r.status = 'posted'
   and r.expires_at > now()
   and r.requester_id <> viewer.user_id
   and extensions.ST_DWithin(r.location, viewer.location, public.discovery_radius_m())
   and not exists (
     select 1 from public.request_responses rr
     where rr.request_id = r.id
       and rr.responder_id = viewer.user_id
       and rr.status = 'declined'
   )
  order by extensions.ST_Distance(r.location, viewer.location) asc, r.created_at desc
  limit 40;
$$;

create function public.browse_request(
  p_request_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  request_id uuid,
  title text,
  description text,
  scheduled_for timestamptz,
  offered_amount numeric,
  currency text,
  location_label text,
  distance_m integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select
      public.assert_onboarded() as user_id,
      public.assert_coordinates(p_latitude, p_longitude) as location
  )
  select
    r.id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(extensions.ST_Distance(r.location, viewer.location))
  from viewer
  join public.requests r
    on r.id = p_request_id
   and r.status = 'posted'
   and r.expires_at > now()
   and r.requester_id <> viewer.user_id
   and extensions.ST_DWithin(r.location, viewer.location, public.discovery_radius_m());
$$;

grant execute on function public.browse_nearby_requests(double precision, double precision) to authenticated;
grant execute on function public.browse_request(uuid, double precision, double precision) to authenticated;

-- ── respond_to_request ────────────────────────────────────────────────────────

create function public.respond_to_request(
  p_request_id uuid,
  p_message text default null,
  p_quoted_amount numeric default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_onboarded();
  v_distance_m integer;
  v_response_id uuid;
  v_request_expires_at timestamptz;
begin
  v_distance_m := public.request_open_to_user(
    p_request_id,
    v_user_id,
    p_latitude,
    p_longitude
  );

  if v_distance_m is null then
    raise exception 'this request is no longer available to you' using errcode = '55000';
  end if;

  select r.expires_at into v_request_expires_at
  from public.requests r
  where r.id = p_request_id;

  insert into public.request_responses (
    request_id,
    responder_id,
    message,
    quoted_amount,
    distance_m,
    expires_at
  )
  values (
    p_request_id,
    v_user_id,
    nullif(btrim(p_message), ''),
    p_quoted_amount,
    v_distance_m,
    v_request_expires_at
  )
  on conflict (request_id, responder_id) do update
  set message = excluded.message,
      quoted_amount = excluded.quoted_amount,
      distance_m = excluded.distance_m,
      expires_at = excluded.expires_at
  where public.request_responses.status = 'pending'
  returning id into v_response_id;

  if v_response_id is null then
    raise exception 'you already have a response on this request' using errcode = '55000';
  end if;

  return v_response_id;
end;
$$;

grant execute on function public.respond_to_request(uuid, text, numeric, double precision, double precision)
  to authenticated;

-- ── list_request_responses / my_responses ─────────────────────────────────────

drop function if exists public.list_request_responses(uuid);
drop function if exists public.my_responses();

create function public.list_request_responses(p_request_id uuid)
returns table (
  response_id uuid,
  responder_id uuid,
  display_name text,
  avatar_path text,
  bio text,
  rating_average numeric,
  rating_count integer,
  jobs_completed integer,
  phone_verified boolean,
  message text,
  quoted_amount numeric,
  distance_m integer,
  status public.response_status,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    rr.id,
    rr.responder_id,
    p.display_name,
    p.avatar_path,
    p.bio,
    p.rating_average,
    p.rating_count,
    p.jobs_completed,
    p.phone is not null as phone_verified,
    rr.message,
    rr.quoted_amount,
    rr.distance_m,
    rr.status,
    rr.created_at,
    rr.expires_at
  from public.requests r
  join public.request_responses rr on rr.request_id = r.id
  join public.profiles p on p.id = rr.responder_id
  where r.id = p_request_id
    and r.requester_id = public.assert_authenticated()
    and rr.status in ('pending', 'accepted')
  order by rr.created_at asc;
$$;

grant execute on function public.list_request_responses(uuid) to authenticated;

create function public.my_responses()
returns table (
  response_id uuid,
  request_id uuid,
  title text,
  description text,
  location_label text,
  distance_m integer,
  scheduled_for timestamptz,
  offered_amount numeric,
  currency text,
  quoted_amount numeric,
  message text,
  response_status public.response_status,
  request_status public.request_status,
  decline_reason text,
  requester_display_name text,
  requester_avatar_path text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.assert_onboarded() as user_id)
  select
    rr.id,
    r.id,
    r.title,
    r.description,
    r.location_label,
    rr.distance_m,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    rr.quoted_amount,
    rr.message,
    rr.status,
    case
      when r.status = 'posted' and r.expires_at <= now() then 'expired'::public.request_status
      else r.status
    end,
    rr.decline_reason,
    p.display_name,
    p.avatar_path,
    rr.created_at
  from me
  join public.request_responses rr on rr.responder_id = me.user_id
  join public.requests r on r.id = rr.request_id
  join public.profiles p on p.id = r.requester_id
  order by rr.created_at desc;
$$;

grant execute on function public.my_responses() to authenticated;

-- ── accept_response (selection → attendance) ──────────────────────────────────

create or replace function public.accept_response(p_response_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_request_id uuid;
  v_selected_user_id uuid;
  v_request_status public.request_status;
  v_response_status public.response_status;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_attending uuid;
  v_accepted uuid;
  v_locked_request_id uuid;
begin
  select rr.request_id
    into v_request_id
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  where rr.id = p_response_id
    and r.requester_id = v_user_id;

  if v_request_id is null then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  select r.status, r.payment_status, r.requester_id
    into v_request_status, v_payment, v_requester_id
  from public.requests r
  where r.id = v_request_id
  for update;

  if v_request_status <> 'posted' then
    raise exception 'this request is already %', v_request_status using errcode = '55000';
  end if;

  if exists (select 1 from public.handshakes h where h.request_id = v_request_id) then
    raise exception 'this request is already accepted' using errcode = '55000';
  end if;

  select rr.request_id, rr.responder_id, rr.status
    into v_locked_request_id, v_selected_user_id, v_response_status
  from public.request_responses rr
  where rr.id = p_response_id
  for update;

  if v_locked_request_id is distinct from v_request_id
     or v_response_status is distinct from 'pending' then
    raise exception 'this response is no longer pending' using errcode = '55000';
  end if;

  select ua.request_id into v_attending
  from public.user_attendance ua
  where ua.user_id = v_selected_user_id
  for update;

  if v_attending is not null then
    raise exception 'This person is already on another job.' using errcode = '55000';
  end if;

  update public.request_responses
  set status = 'accepted', resolved_at = now()
  where id = p_response_id
    and status = 'pending'
  returning id into v_accepted;

  if v_accepted is null then
    raise exception 'this response is no longer pending' using errcode = '55000';
  end if;

  update public.request_responses
  set status = 'declined', resolved_at = now()
  where request_id = v_request_id
    and id <> p_response_id
    and status = 'pending';

  update public.requests
  set status = 'accepted',
      accepted_at = now(),
      accepted_response_id = p_response_id,
      selected_user_id = v_selected_user_id
  where id = v_request_id;

  insert into public.handshakes (request_id, response_id, requester_id, selected_user_id)
  values (v_request_id, p_response_id, v_requester_id, v_selected_user_id);

  if v_payment = 'locked' then
    perform public.apply_payment_transition(
      v_request_id,
      'pending',
      'handshake:' || v_request_id::text
    );
  end if;

  perform public.set_user_attendance(v_selected_user_id, v_request_id);

  return v_request_id;
end;
$$;

-- ── get_engagement ────────────────────────────────────────────────────────────

drop function if exists public.get_engagement(uuid);

create function public.get_engagement(p_request_id uuid)
returns table (
  request_id uuid,
  title text,
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
  completion_confirm_by timestamptz,
  service_problem_kind public.service_problem_kind,
  service_problem_respond_by timestamptz,
  service_problem_reported_by_me boolean,
  service_problem_description text,
  viewer_is_requester boolean,
  location_label text,
  request_latitude double precision,
  request_longitude double precision,
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
    r.title,
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
    r.completion_confirm_by,
    sp.kind,
    sp.respond_by,
    sp.reported_by = me.user_id,
    sp.description,
    r.requester_id = me.user_id,
    r.location_label,
    extensions.ST_Y(r.location::extensions.geometry),
    extensions.ST_X(r.location::extensions.geometry),
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
   and me.user_id in (r.requester_id, r.selected_user_id)
  join public.profiles counterparty
    on counterparty.id = case
      when r.requester_id = me.user_id then r.selected_user_id
      else r.requester_id
    end
  left join public.request_responses accepted on accepted.id = r.accepted_response_id
  left join public.service_problems sp
    on sp.request_id = r.id
   and sp.status = 'open'
  left join public.ratings rating on rating.request_id = r.id
  left join public.handshakes h on h.request_id = r.id;
$$;

grant execute on function public.get_engagement(uuid) to authenticated;

