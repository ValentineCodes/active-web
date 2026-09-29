-- Requester selection: atomic commitment, attendance, privacy unlock (handshake), and notifications.

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
  v_request_expires_at timestamptz;
  v_attending uuid;
  v_accepted uuid;
  v_locked_request_id uuid;
begin
  -- Resolve request and verify the caller is the requester.
  select rr.request_id
    into v_request_id
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  where rr.id = p_response_id
    and r.requester_id = v_user_id;

  if v_request_id is null then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  -- 1. Atomically verify the request is still selectable.
  select r.status, r.payment_status, r.requester_id, r.expires_at
    into v_request_status, v_payment, v_requester_id, v_request_expires_at
  from public.requests r
  where r.id = v_request_id
  for update;

  if exists (select 1 from public.handshakes h where h.request_id = v_request_id) then
    raise exception 'someone is already helping on this request' using errcode = '55000';
  end if;

  if v_request_status <> 'posted' then
    raise exception 'this request is no longer open for selection' using errcode = '55000';
  end if;

  if v_request_expires_at <= now() then
    raise exception 'this request is no longer open for selection' using errcode = '55000';
  end if;

  select rr.request_id, rr.responder_id, rr.status
    into v_locked_request_id, v_selected_user_id, v_response_status
  from public.request_responses rr
  where rr.id = p_response_id
  for update;

  if v_locked_request_id is distinct from v_request_id
     or v_response_status is distinct from 'pending' then
    raise exception 'this response is no longer available' using errcode = '55000';
  end if;

  -- 2. Atomically verify the responder is not attending another request.
  select ua.request_id into v_attending
  from public.user_attendance ua
  where ua.user_id = v_selected_user_id
  for update;

  if v_attending is not null then
    raise exception 'This person is currently attending to another request.' using errcode = '55000';
  end if;

  -- 3. Select the responder (this response only).
  update public.request_responses
  set status = 'accepted', resolved_at = now()
  where id = p_response_id
    and status = 'pending'
  returning id into v_accepted;

  if v_accepted is null then
    raise exception 'this response is no longer available' using errcode = '55000';
  end if;

  update public.request_responses
  set status = 'declined', resolved_at = now()
  where request_id = v_request_id
    and id <> p_response_id
    and status = 'pending';

  -- 5. Update request state.
  update public.requests
  set status = 'accepted',
      accepted_at = now(),
      accepted_response_id = p_response_id,
      selected_user_id = v_selected_user_id
  where id = v_request_id
    and status = 'posted';

  if not found then
    raise exception 'this request is no longer open for selection' using errcode = '55000';
  end if;

  -- 4. Mark attending (single active job per user).
  perform public.set_user_attendance(v_selected_user_id, v_request_id);

  -- 6. Privacy boundary — handshake unlocks contact and exact location via get_engagement.
  insert into public.handshakes (request_id, response_id, requester_id, selected_user_id)
  values (v_request_id, p_response_id, v_requester_id, v_selected_user_id);

  if v_payment = 'locked' then
    perform public.apply_payment_transition(
      v_request_id,
      'pending',
      'handshake:' || v_request_id::text
    );
  end if;

  -- 7. Push notifications fire on handshakes + request status triggers.

  return v_request_id;
end;
$$;

create or replace function public.notify_provider_of_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_name text;
  v_title text;
begin
  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = new.requester_id;

  v_title := format('%s chose you', coalesce(v_requester_name, 'Someone'));

  perform public.send_push(
    array[new.selected_user_id],
    v_title,
    'Open the job for their exact location and phone number.',
    format('/engagement/%s', new.request_id)
  );

  return new;
end;
$$;

create or replace function public.notify_requester_of_provider_selected()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_selected_name text;
  v_title text;
begin
  if new.status <> 'accepted'::public.request_status
     or old.status = new.status then
    return new;
  end if;

  select p.display_name into v_selected_name
  from public.profiles p
  where p.id = new.selected_user_id;

  v_title := format('%s is helping you', coalesce(v_selected_name, 'Your helper'));

  perform public.send_push(
    array[new.requester_id],
    v_title,
    'Open the job for contact details and the exact meeting location.',
    format('/engagement/%s', new.id)
  );

  return new;
end;
$$;
