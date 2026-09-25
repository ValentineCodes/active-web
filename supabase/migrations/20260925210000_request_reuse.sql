-- Link new requests to an expired or completed predecessor when the requester reuses one.
-- The client prefills and edits before calling create_request; this only validates lineage.

drop function if exists public.create_request(
  text, text, double precision, double precision, text, integer, timestamptz, numeric, jsonb
);

create or replace function public.create_request(
  p_category_slug text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_search_radius_m integer,
  p_scheduled_for timestamptz default null,
  p_offered_amount numeric default null,
  p_category_data jsonb default '{}'::jsonb,
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
      or (v_source.status = 'searching' and v_source.expires_at <= now())
    ) then
      raise exception 'only expired or completed requests can be reused' using errcode = '55000';
    end if;
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
    expires_at,
    source_request_id
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
    coalesce(p_scheduled_for, now()) + interval '24 hours',
    p_source_request_id
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
  text, text, double precision, double precision, text, integer, timestamptz, numeric, jsonb, uuid
) from public, anon;
grant execute on function public.create_request(
  text, text, double precision, double precision, text, integer, timestamptz, numeric, jsonb, uuid
) to authenticated;

revoke execute on function public.create_request(
  text, text, double precision, double precision, text, integer, timestamptz, numeric, jsonb
) from public, anon, authenticated;
