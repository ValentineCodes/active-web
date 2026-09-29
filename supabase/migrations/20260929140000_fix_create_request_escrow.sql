-- create_request must insert not_required payment status, then lock escrow (locked → locked fails).

create or replace function public.create_request(
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
  v_charge record;
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

  select * into v_charge from public.compute_request_charge(p_offered_amount);

  perform public.ensure_wallet_account(v_user_id);

  if (
    select wa.available
    from public.wallet_accounts wa
    where wa.user_id = v_user_id
  ) < v_charge.total then
    raise exception 'insufficient wallet balance to fund this request' using errcode = '55000';
  end if;

  v_payment := 'not_required';

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
