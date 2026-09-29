-- Active request lifecycle (stored status → product language):
--   posted (+ pending responses) → Posted / Responses
--   accepted → Selected
--   in_progress → In progress
--   completion_pending → Completion pending
--   completed → Completed
--   expired | cancelled | disputed → same names in UI

comment on type public.request_status is
  'Stored lifecycle: posted (open/responses), accepted (selected), in_progress, completion_pending, completed, cancelled, expired, disputed, no_show, draft. Legacy searching is migrated to posted.';

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

create or replace function public.notify_expiring_requests(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_notified integer := 0;
begin
  if p_limit < 1 then
    raise exception 'limit must be at least 1' using errcode = '22023';
  end if;

  for v_row in
    select r.id, r.requester_id
    from public.requests r
    where r.status = 'posted'::public.request_status
      and r.expires_at > now()
      and r.expires_at <= now() + interval '2 hours'
      and r.expiry_reminder_sent_at is null
      and not exists (select 1 from public.handshakes h where h.request_id = r.id)
    order by r.expires_at
    limit p_limit
    for update skip locked
  loop
    perform public.send_push(
      array[v_row.requester_id],
      'Expiring soon',
      'Your request will expire in about two hours if you have not chosen someone yet.',
      format('/request/%s', v_row.id)
    );

    update public.requests
    set expiry_reminder_sent_at = now()
    where id = v_row.id;

    v_notified := v_notified + 1;
  end loop;

  return v_notified;
end;
$$;
