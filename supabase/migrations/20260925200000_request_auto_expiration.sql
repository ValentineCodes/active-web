-- Persist request expiry server-side: searching requests with no handshake after 24h
-- become `expired`, pending responses are closed, and locked funds are refunded.

create or replace function public.expire_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.request_status;
  v_payment public.payment_status;
  v_expires_at timestamptz;
begin
  select r.status, r.payment_status, r.expires_at
    into v_status, v_payment, v_expires_at
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'expired' then
    return false;
  end if;

  if v_status <> 'searching' then
    return false;
  end if;

  if v_expires_at is null or v_expires_at > now() then
    return false;
  end if;

  if exists (select 1 from public.handshakes h where h.request_id = p_request_id) then
    return false;
  end if;

  update public.request_responses
  set status = 'expired'::public.response_status,
      resolved_at = now()
  where request_id = p_request_id
    and status = 'pending';

  update public.requests
  set status = 'expired'::public.request_status
  where id = p_request_id;

  if v_payment = 'locked' then
    perform public.apply_payment_transition(
      p_request_id,
      'refunded'::public.payment_status,
      'expire:' || p_request_id::text
    );
  end if;

  return true;
end;
$$;

create or replace function public.expire_due_requests(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_expired_count integer := 0;
begin
  if p_limit < 1 then
    raise exception 'limit must be at least 1' using errcode = '22023';
  end if;

  for v_request_id in
    select r.id
    from public.requests r
    where r.status = 'searching'::public.request_status
      and r.expires_at is not null
      and r.expires_at <= now()
      and not exists (
        select 1 from public.handshakes h where h.request_id = r.id
      )
    order by r.expires_at
    limit p_limit
    for update skip locked
  loop
    if public.expire_request(v_request_id) then
      v_expired_count := v_expired_count + 1;
    end if;
  end loop;

  return v_expired_count;
end;
$$;

revoke all on function public.expire_request(uuid) from public, anon, authenticated;
revoke all on function public.expire_due_requests(integer) from public, anon, authenticated;

create or replace function public.create_request(
  p_category_slug text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_search_radius_m integer,
  p_scheduled_for timestamptz default null,
  p_offered_amount numeric default null,
  p_category_data jsonb default '{}'::jsonb
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
begin
  if not exists (
    select 1 from public.service_categories
    where slug = p_category_slug and is_active
  ) then
    raise exception 'unknown service category' using errcode = '22023';
  end if;

  if p_search_radius_m not between 1000 and 50000 then
    raise exception 'search radius must be between 1 km and 50 km' using errcode = '22023';
  end if;

  if p_scheduled_for is not null and p_scheduled_for < now() - interval '5 minutes' then
    raise exception 'scheduled time is in the past' using errcode = '22023';
  end if;

  if p_scheduled_for is not null and p_scheduled_for > now() + interval '30 days' then
    raise exception 'scheduled time is too far in the future' using errcode = '22023';
  end if;

  if jsonb_typeof(p_category_data) is distinct from 'object' then
    raise exception 'category data must be a JSON object' using errcode = '22023';
  end if;

  if (
    select count(*) from public.requests
    where requester_id = v_user_id
      and (
        status in ('accepted', 'in_progress', 'completion_pending')
        or (status = 'searching' and expires_at > now())
      )
  ) >= 5 then
    raise exception 'you already have 5 open requests' using errcode = '55000';
  end if;

  if p_offered_amount is not null and p_offered_amount > 0 then
    v_payment := 'locked';
  else
    v_payment := 'not_required';
  end if;

  insert into public.requests (
    requester_id,
    category_slug,
    description,
    category_data,
    scheduled_for,
    offered_amount,
    payment_status,
    location,
    location_label,
    search_radius_m,
    status,
    submitted_at,
    expires_at
  )
  values (
    v_user_id,
    p_category_slug,
    btrim(p_description),
    p_category_data,
    p_scheduled_for,
    p_offered_amount,
    v_payment,
    v_location,
    btrim(p_location_label),
    p_search_radius_m,
    'searching',
    now(),
    coalesce(p_scheduled_for, now()) + interval '24 hours'
  )
  returning id into v_request_id;

  if v_payment = 'locked' then
    insert into public.payment_transitions (request_id, idempotency_key, from_status, to_status)
    values (v_request_id, 'create:' || v_request_id::text, 'not_required', 'locked');
  end if;

  return v_request_id;
end;
$$;

revoke execute on function public.create_request(
  text, text, double precision, double precision, text, integer, timestamptz, numeric, jsonb
) from public, anon;
grant execute on function public.create_request(
  text, text, double precision, double precision, text, integer, timestamptz, numeric, jsonb
) to authenticated;

create or replace function public.expand_request_radius(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_current integer;
  v_next integer;
begin
  select search_radius_m into v_current
  from public.requests
  where id = p_request_id
    and requester_id = v_user_id
    and status = 'searching'::public.request_status
    and expires_at > now()
  for update;

  if v_current is null then
    raise exception 'request is not searching' using errcode = '55000';
  end if;

  select min(rung) into v_next
  from unnest(public.radius_ladder_m()) as rung
  where rung > v_current;

  if v_next is null then
    raise exception 'request is already searching the widest area' using errcode = '55000';
  end if;

  update public.requests
  set search_radius_m = v_next,
      radius_expansions = radius_expansions + 1
  where id = p_request_id;

  return v_next;
end;
$$;

revoke execute on function public.expand_request_radius(uuid) from public, anon;
grant execute on function public.expand_request_radius(uuid) to authenticated;

-- Run periodically on Supabase (pg_cron). Tests and ops can call expire_due_requests() directly.
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'expire-searching-requests';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'expire-searching-requests',
  '*/5 * * * *',
  $$select public.expire_due_requests()$$
);
