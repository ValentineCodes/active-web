-- Domain model: handshake record, separate payment state, catalogue media, request lineage,
-- service-phase statuses, and idempotent payment / clone operations.

-- Payment is orthogonal to request/service lifecycle.
create type public.payment_status as enum (
  'not_required',
  'available',
  'locked',
  'pending',
  'released',
  'refunded',
  'disputed'
);

create type public.profile_catalogue_kind as enum ('photo', 'video');

-- Category-specific fields (shape validated in application code per category).
alter table public.requests
  add column category_data jsonb not null default '{}'::jsonb,
  add column payment_status public.payment_status not null default 'not_required',
  add column source_request_id uuid references public.requests (id) on delete restrict,
  add constraint requests_category_data_is_object check (jsonb_typeof(category_data) = 'object');

create index requests_source_request_idx on public.requests (source_request_id)
  where source_request_id is not null;

alter table public.requests drop constraint if exists requests_accepted_has_provider;

alter table public.requests
  add constraint requests_accepted_has_provider check (
    (
      status in (
        'accepted',
        'in_progress',
        'completion_pending',
        'completed',
        'disputed',
        'no_show'
      )
    ) = (provider_id is not null)
  );

alter table public.profiles
  add column avatar_captured_in_app boolean not null default false;

-- Optional provider catalogue (up to 6 photos and 1 video per user).
create table public.profile_catalogue_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.profile_catalogue_kind not null,
  storage_path text not null,
  sort_order smallint not null check (sort_order between 0 and 5),
  created_at timestamptz not null default now(),
  unique (user_id, storage_path),
  unique (user_id, kind, sort_order)
);

create index profile_catalogue_media_user_idx on public.profile_catalogue_media (user_id, kind);

-- Immutable handshake: one per request, created at acceptance.
create table public.handshakes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.requests (id) on delete restrict,
  response_id uuid not null unique references public.request_responses (id) on delete restrict,
  requester_id uuid not null references public.profiles (id) on delete restrict,
  provider_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index handshakes_provider_idx on public.handshakes (provider_id, created_at desc);

-- Responses are valid only while the parent request is open for matching.
alter table public.request_responses
  add column expires_at timestamptz;

-- Idempotency for money and clone operations.
create table public.idempotent_operations (
  key text primary key,
  operation text not null,
  request_id uuid references public.requests (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.payment_transitions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete restrict,
  idempotency_key text not null,
  from_status public.payment_status not null,
  to_status public.payment_status not null,
  created_at timestamptz not null default now(),
  unique (request_id, idempotency_key)
);

create index payment_transitions_request_idx on public.payment_transitions (request_id, created_at);

-- Catalogue limits.
create function public.guard_profile_catalogue_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_photo_count integer;
  v_video_count integer;
begin
  select count(*)::integer into v_photo_count
  from public.profile_catalogue_media
  where user_id = new.user_id and kind = 'photo';

  select count(*)::integer into v_video_count
  from public.profile_catalogue_media
  where user_id = new.user_id and kind = 'video';

  if tg_op = 'INSERT' then
    if new.kind = 'photo' and v_photo_count >= 6 then
      raise exception 'catalogue cannot have more than 6 photos' using errcode = '22023';
    end if;
    if new.kind = 'video' and v_video_count >= 1 then
      raise exception 'catalogue cannot have more than 1 video' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger profile_catalogue_media_guard_limits
  before insert on public.profile_catalogue_media
  for each row execute function public.guard_profile_catalogue_limits();

-- Historical requests are not edited in place (payment moves via payment_transitions only).
create function public.guard_request_history_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('completed', 'cancelled', 'expired', 'no_show') then
    raise exception 'request % is a historical record and cannot be changed', old.id
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger requests_guard_history_immutable
  before update on public.requests
  for each row execute function public.guard_request_history_immutable();

create function public.guard_handshake_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'handshakes cannot be modified' using errcode = '55000';
end;
$$;

create trigger handshakes_no_update
  before update or delete on public.handshakes
  for each row execute function public.guard_handshake_immutable();

-- Allowed payment transitions (enforced in apply_payment_transition).
create function public.apply_payment_transition(
  p_request_id uuid,
  p_to_status public.payment_status,
  p_idempotency_key text
)
returns public.payment_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.payment_status;
  v_allowed boolean;
  v_existing public.payment_status;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  select pt.to_status into v_existing
  from public.payment_transitions pt
  where pt.request_id = p_request_id
    and pt.idempotency_key = p_idempotency_key;

  if v_existing is not null then
    return v_existing;
  end if;

  select payment_status into v_from
  from public.requests
  where id = p_request_id
  for update;

  if v_from is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  v_allowed := case
    when v_from = 'not_required' and p_to_status = 'not_required' then true
    when v_from = 'available' and p_to_status in ('locked', 'not_required') then true
    when v_from = 'locked' and p_to_status in ('pending', 'refunded', 'disputed') then true
    when v_from = 'pending' and p_to_status in ('released', 'refunded', 'disputed') then true
    when v_from = 'released' and p_to_status = 'disputed' then true
    when v_from = 'refunded' and p_to_status = 'disputed' then true
    when v_from = 'disputed' and p_to_status in ('released', 'refunded') then true
    else false
  end;

  if not v_allowed then
    raise exception 'payment cannot move from % to %', v_from, p_to_status using errcode = '55000';
  end if;

  insert into public.payment_transitions (request_id, idempotency_key, from_status, to_status)
  values (p_request_id, p_idempotency_key, v_from, p_to_status);

  update public.requests
  set payment_status = p_to_status
  where id = p_request_id;

  return p_to_status;
end;
$$;

revoke execute on function public.apply_payment_transition(uuid, public.payment_status, text)
  from public, anon, authenticated;

-- Provider marks work done; requester (or auto-complete later) still confirms completion.
create function public.mark_service_complete(p_request_id uuid)
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

  if v_status not in ('accepted', 'in_progress') then
    raise exception 'only an active service can be marked complete' using errcode = '55000';
  end if;

  update public.requests
  set status = 'completion_pending'
  where id = p_request_id;
end;
$$;

revoke execute on function public.mark_service_complete(uuid) from public, anon;
grant execute on function public.mark_service_complete(uuid) to authenticated;

-- New request from an expired or completed predecessor (never reactivates the old row).
create function public.clone_request_from_prior(
  p_source_request_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_onboarded();
  v_source public.requests%rowtype;
  v_clone_id uuid;
  v_existing uuid;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  select io.request_id into v_existing
  from public.idempotent_operations io
  where io.key = p_idempotency_key;

  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_source
  from public.requests
  where id = p_source_request_id and requester_id = v_user_id;

  if v_source.id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if not (
    v_source.status = 'completed'
    or v_source.status = 'expired'
    or (v_source.status = 'searching' and v_source.expires_at <= now())
  ) then
    raise exception 'only expired or completed requests can be reused' using errcode = '55000';
  end if;

  v_clone_id := public.create_request(
    v_source.category_slug,
    v_source.description,
    extensions.ST_Y(v_source.location::extensions.geometry),
    extensions.ST_X(v_source.location::extensions.geometry),
    v_source.location_label,
    v_source.search_radius_m,
    v_source.scheduled_for,
    v_source.offered_amount,
    v_source.category_data
  );

  update public.requests
  set source_request_id = p_source_request_id
  where id = v_clone_id;

  insert into public.idempotent_operations (key, operation, request_id)
  values (p_idempotency_key, 'clone_request_from_prior', v_clone_id);

  return v_clone_id;
end;
$$;

revoke execute on function public.clone_request_from_prior(uuid, text) from public, anon;
grant execute on function public.clone_request_from_prior(uuid, text) to authenticated;

-- Storage for catalogue media (private, same path convention as avatars).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalogue',
  'catalogue',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
on conflict (id) do nothing;

create policy "signed in users can read catalogue media"
  on storage.objects for select to authenticated
  using (bucket_id = 'catalogue');

create policy "users write their own catalogue media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'catalogue'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users replace their own catalogue media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'catalogue'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users delete their own catalogue media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'catalogue'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter table public.profile_catalogue_media enable row level security;
alter table public.handshakes enable row level security;
alter table public.idempotent_operations enable row level security;
alter table public.payment_transitions enable row level security;

revoke all on public.profile_catalogue_media from anon, authenticated;
revoke all on public.handshakes from anon, authenticated;
revoke all on public.idempotent_operations from anon, authenticated;
revoke all on public.payment_transitions from anon, authenticated;

grant select, insert, update, delete on public.profile_catalogue_media to authenticated;

create policy "manage own catalogue media"
  on public.profile_catalogue_media for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select on public.handshakes to authenticated;

create policy "parties read handshake"
  on public.handshakes for select to authenticated
  using (
    requester_id = (select auth.uid())
    or provider_id = (select auth.uid())
  );
