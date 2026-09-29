-- Server-side request expiration (fixed lifetime, no user setting) and cancellation.
-- Expiration is idempotent, skips selected requests (handshake), and refunds locked funds.
-- Cancellation reuses existing post-selection rules; pre-selection cancel closes responses.

create or replace function public.request_lifetime_interval()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '24 hours';
$$;

comment on function public.request_lifetime_interval() is
  'How long a posted request stays open for selection (from scheduled time or post time).';

create or replace function public.request_expires_at(p_scheduled_for timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce(p_scheduled_for, now()) + public.request_lifetime_interval();
$$;

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
    public.request_expires_at(p_scheduled_for),
    p_source_request_id
  )
  returning id into v_request_id;

  perform public.lock_request_escrow(v_request_id, 'create:' || v_request_id::text);

  return v_request_id;
end;
$$;

create or replace function public.expire_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.request_status;
  v_from_status public.request_status;
  v_payment public.payment_status;
  v_expires_at timestamptz;
  v_requester_id uuid;
  v_responder_ids uuid[];
  v_responder_id uuid;
begin
  select r.status, r.payment_status, r.expires_at, r.requester_id
    into v_status, v_payment, v_expires_at, v_requester_id
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'expired' then
    return false;
  end if;

  if v_status <> 'posted' then
    return false;
  end if;

  if v_expires_at is null or v_expires_at > now() then
    return false;
  end if;

  if exists (select 1 from public.handshakes h where h.request_id = p_request_id) then
    return false;
  end if;

  v_from_status := v_status;

  select coalesce(array_agg(distinct rr.responder_id), '{}')
    into v_responder_ids
  from public.request_responses rr
  where rr.request_id = p_request_id
    and rr.status = 'pending';

  update public.request_responses
  set status = 'expired'::public.response_status,
      resolved_at = now()
  where request_id = p_request_id
    and status = 'pending';

  update public.requests
  set status = 'expired'::public.request_status
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_requester_id,
    v_from_status,
    'expired'::public.request_status,
    'expire:' || p_request_id::text
  );

  if v_payment = 'locked' then
    perform public.apply_payment_transition(
      p_request_id,
      'refunded'::public.payment_status,
      'expire:' || p_request_id::text
    );
  end if;

  perform public.send_push(
    array[v_requester_id],
    'Expired',
    'This request expired before anyone was chosen. You can post it again.',
    format('/request/%s', p_request_id)
  );

  foreach v_responder_id in array v_responder_ids
  loop
    perform public.send_push(
      array[v_responder_id],
      'Expired',
      'A request you responded to expired before anyone was chosen.',
      '/activity'
    );
  end loop;

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
    where r.status = 'posted'::public.request_status
      and r.expires_at is not null
      and r.expires_at <= now()
      and not exists (select 1 from public.handshakes h where h.request_id = r.id)
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

create or replace function public.finalize_request_cancellation(
  p_request_id uuid,
  p_actor_id uuid,
  p_status_event_key text,
  p_payment_idempotency_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.request_status;
  v_selected_user_id uuid;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_responder_ids uuid[];
  v_responder_id uuid;
begin
  if p_status_event_key is null or btrim(p_status_event_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if p_payment_idempotency_key is null or btrim(p_payment_idempotency_key) = '' then
    raise exception 'payment idempotency key is required' using errcode = '22023';
  end if;

  select r.status, r.selected_user_id, r.requester_id, r.payment_status
    into v_status, v_selected_user_id, v_requester_id, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'cancelled' then
    return false;
  end if;

  if v_status = 'completed' then
    raise exception 'a completed request cannot be cancelled' using errcode = '55000';
  end if;

  if v_status in ('expired', 'no_show', 'disputed') then
    raise exception 'a request cannot be cancelled once it is %', v_status using errcode = '55000';
  end if;

  if v_status not in ('draft', 'posted', 'accepted', 'in_progress', 'completion_pending') then
    raise exception 'a request cannot be cancelled once it is %', v_status using errcode = '55000';
  end if;

  if v_status = 'posted' then
    select coalesce(array_agg(distinct rr.responder_id), '{}')
      into v_responder_ids
    from public.request_responses rr
    where rr.request_id = p_request_id
      and rr.status = 'pending';
  end if;

  update public.request_responses
  set status = case
                 when status = 'accepted' then 'declined'::public.response_status
                 else 'expired'::public.response_status
               end,
      resolved_at = coalesce(resolved_at, now())
  where request_id = p_request_id
    and status in ('pending', 'accepted');

  update public.requests
  set status = 'cancelled',
      cancelled_at = now(),
      selected_user_id = null,
      accepted_response_id = null,
      completion_confirm_by = null
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_status,
    'cancelled'::public.request_status,
    p_status_event_key
  );

  if v_payment in ('locked', 'pending') then
    perform public.apply_payment_transition(
      p_request_id,
      'refunded'::public.payment_status,
      p_payment_idempotency_key
    );
  end if;

  if v_selected_user_id is not null then
    perform public.release_provider(v_selected_user_id);
  end if;

  if v_status = 'posted' and p_actor_id = v_requester_id then
    foreach v_responder_id in array v_responder_ids
    loop
      perform public.send_push(
        array[v_responder_id],
        'Request cancelled',
        'The requester cancelled this request before anyone was chosen.',
        '/activity'
      );
    end loop;
  elsif p_actor_id = v_requester_id and v_selected_user_id is not null then
    perform public.send_push(
      array[v_selected_user_id],
      'Request cancelled',
      'The client cancelled this job before it finished.',
      format('/engagement/%s', p_request_id)
    );
  elsif v_selected_user_id is not null and p_actor_id = v_selected_user_id then
    perform public.send_push(
      array[v_requester_id],
      'Service cancelled',
      'Your helper cancelled this job. Any secured payment will be refunded.',
      format('/engagement/%s', p_request_id)
    );
  end if;

  return true;
end;
$$;

create or replace function public.cancel_service(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_selected_user_id uuid;
  v_status public.request_status;
begin
  select r.selected_user_id, r.status
    into v_selected_user_id, v_status
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_selected_user_id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_selected_user_id <> v_user_id then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status not in ('accepted', 'in_progress', 'completion_pending') then
    raise exception 'only an active service can be cancelled by the provider' using errcode = '55000';
  end if;

  perform public.finalize_request_cancellation(
    p_request_id,
    v_user_id,
    'cancel_service:' || p_request_id::text,
    'cancel:' || p_request_id::text
  );
end;
$$;

revoke all on function public.expire_request(uuid) from public, anon, authenticated;
revoke all on function public.expire_due_requests(integer) from public, anon, authenticated;
revoke all on function public.finalize_request_cancellation(uuid, uuid, text, text)
  from public, anon, authenticated;

revoke execute on function public.cancel_service(uuid) from public, anon;
grant execute on function public.cancel_service(uuid) to authenticated;
