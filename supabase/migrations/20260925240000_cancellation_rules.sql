-- Authoritative cancellation: requester cancel_request, provider cancel_service,
-- pre-handshake withdraw_response. Idempotent, full refund (MVP), status event trail.

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
  v_provider_id uuid;
  v_payment public.payment_status;
begin
  if p_status_event_key is null or btrim(p_status_event_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if p_payment_idempotency_key is null or btrim(p_payment_idempotency_key) = '' then
    raise exception 'payment idempotency key is required' using errcode = '22023';
  end if;

  select r.status, r.provider_id, r.payment_status
    into v_status, v_provider_id, v_payment
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

  if v_status not in ('draft', 'searching', 'accepted', 'in_progress', 'completion_pending') then
    raise exception 'a request cannot be cancelled once it is %', v_status using errcode = '55000';
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
      provider_id = null,
      accepted_response_id = null,
      completion_confirm_by = null
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_status,
    'cancelled',
    p_status_event_key
  );

  if v_payment in ('locked', 'pending') then
    perform public.apply_payment_transition(
      p_request_id,
      'refunded',
      p_payment_idempotency_key
    );
  end if;

  if v_provider_id is not null then
    perform public.release_provider(v_provider_id);
  end if;

  return true;
end;
$$;

revoke all on function public.finalize_request_cancellation(uuid, uuid, text, text)
  from public, anon, authenticated;

create or replace function public.cancel_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_requester_id uuid;
begin
  select r.requester_id
    into v_requester_id
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_requester_id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_requester_id <> v_user_id then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  perform public.finalize_request_cancellation(
    p_request_id,
    v_user_id,
    'cancel_request:' || p_request_id::text,
    'cancel:' || p_request_id::text
  );
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
  v_provider_id uuid;
  v_status public.request_status;
begin
  select r.provider_id, r.status
    into v_provider_id, v_status
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_provider_id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_provider_id <> v_user_id then
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

create or replace function public.withdraw_response(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_status public.response_status;
  v_updated uuid;
begin
  select status into v_status
  from public.request_responses
  where id = p_response_id
    and provider_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'this response can no longer be withdrawn' using errcode = '55000';
  end if;

  if v_status = 'withdrawn' then
    return;
  end if;

  update public.request_responses
  set status = 'withdrawn',
      resolved_at = now()
  where id = p_response_id
    and provider_id = v_user_id
    and status = 'pending'
  returning id into v_updated;

  if v_updated is null then
    raise exception 'this response can no longer be withdrawn' using errcode = '55000';
  end if;
end;
$$;

revoke execute on function public.cancel_service(uuid) from public, anon;
grant execute on function public.cancel_service(uuid) to authenticated;
