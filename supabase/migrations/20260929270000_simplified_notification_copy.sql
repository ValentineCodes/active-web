-- Human-readable push/inbox copy for the simplified Active lifecycle (no provider/matching jargon).

create or replace function public.display_first_name(p_display_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(split_part(coalesce(p_display_name, ''), ' ', 1)), '');
$$;

revoke all on function public.display_first_name(text) from public, anon, authenticated;

-- Requester: request is live after posting
create or replace function public.notify_requester_request_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'posted'::public.request_status then
    return new;
  end if;

  perform public.send_push(
    array[new.requester_id],
    'Request posted',
    format(
      'Your request "%s" is live. We''ll let you know when someone responds.',
      left(new.title, 80)
    ),
    format('/request/%s', new.id)
  );

  return new;
end;
$$;

-- Requester: new response (first vs several)
create or replace function public.notify_requester_of_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_id uuid;
  v_responder_name text;
  v_responder_first text;
  v_pending_count integer;
  v_title text;
  v_body text;
begin
  if new.status <> 'pending'::public.response_status then
    return new;
  end if;

  select r.requester_id into v_requester_id
  from public.requests r
  where r.id = new.request_id;

  select p.display_name into v_responder_name
  from public.profiles p
  where p.id = new.responder_id;

  v_responder_first := coalesce(public.display_first_name(v_responder_name), 'Someone');

  select count(*)::integer into v_pending_count
  from public.request_responses rr
  where rr.request_id = new.request_id
    and rr.status = 'pending';

  if v_pending_count <= 1 then
    v_title := 'New response';
    v_body := format('%s wants to help with your request.', v_responder_first);
  elsif v_pending_count = 2 then
    v_title := 'Another response';
    v_body := 'You now have two responses to review.';
  else
    v_title := 'New response';
    v_body := format(
      '%s responded. You now have %s responses to review.',
      v_responder_first,
      v_pending_count
    );
  end if;

  perform public.send_push(
    array[v_requester_id],
    v_title,
    v_body,
    format('/request/%s', new.request_id)
  );

  return new;
end;
$$;

-- Responder: response submitted
create or replace function public.notify_responder_of_response_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_name text;
  v_requester_first text;
  v_title text;
begin
  if new.status <> 'pending'::public.response_status then
    return new;
  end if;

  select p.display_name into v_requester_name
  from public.profiles p
  join public.requests r on r.requester_id = p.id
  where r.id = new.request_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'them');
  v_title := left(
    (select r.title from public.requests r where r.id = new.request_id),
    80
  );

  perform public.send_push(
    array[new.responder_id],
    'Response sent',
    format('Your response to "%s" was sent. %s will see it with your profile.', v_title, v_requester_first),
    format('/respond/%s', new.request_id)
  );

  return new;
end;
$$;

drop trigger if exists request_responses_notify_responder on public.request_responses;

create trigger request_responses_notify_responder
  after insert on public.request_responses
  for each row
  when (new.status = 'pending'::public.response_status)
  execute function public.notify_responder_of_response_submitted();

-- Responder: chosen on handshake
create or replace function public.notify_provider_of_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_name text;
  v_requester_first text;
begin
  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = new.requester_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'them');

  perform public.send_push(
    array[new.selected_user_id],
    format('You''re helping %s now', v_requester_first),
    'Open the request for contact details and where to meet.',
    format('/engagement/%s', new.request_id)
  );

  return new;
end;
$$;

-- Requester: someone selected (status → accepted)
create or replace function public.notify_requester_of_provider_selected()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_selected_name text;
  v_selected_first text;
begin
  if new.status <> 'accepted'::public.request_status
     or old.status = new.status then
    return new;
  end if;

  select p.display_name into v_selected_name
  from public.profiles p
  where p.id = new.selected_user_id;

  v_selected_first := coalesce(public.display_first_name(v_selected_name), 'Your helper');

  perform public.send_push(
    array[new.requester_id],
    format('%s is helping you', v_selected_first),
    'Open the request for their contact details and your meeting location.',
    format('/engagement/%s', new.id)
  );

  return new;
end;
$$;

create or replace function public.notify_responders_not_chosen(
  p_request_id uuid,
  p_chosen_response_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_name text;
  v_requester_first text;
  v_responder_id uuid;
begin
  select p.display_name into v_requester_name
  from public.profiles p
  join public.requests r on r.requester_id = p.id
  where r.id = p_request_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'The requester');

  for v_responder_id in
    select rr.responder_id
    from public.request_responses rr
    where rr.request_id = p_request_id
      and rr.id <> p_chosen_response_id
      and rr.status = 'declined'::public.response_status
  loop
    perform public.send_push(
      array[v_responder_id],
      'Someone else was chosen',
      format('%s chose someone else for this request.', v_requester_first),
      '/(tabs)/requests'
    );
  end loop;
end;
$$;

revoke all on function public.notify_responders_not_chosen(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.notify_payment_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_id uuid;
  v_total numeric;
  v_currency text;
begin
  select r.requester_id, r.currency
    into v_requester_id, v_currency
  from public.requests r
  where r.id = new.request_id;

  select re.total into v_total
  from public.request_escrow re
  where re.request_id = new.request_id;

  if new.to_status = 'locked'::public.payment_status
     and new.idempotency_key like 'create:%' then
    perform public.send_push(
      array[v_requester_id],
      'Offer set aside',
      coalesce(
        format('We set aside %s %s for this request.', v_total, v_currency),
        'Your offer is set aside for this request.'
      ),
      format('/request/%s', new.request_id)
    );
  elsif new.to_status = 'refunded'::public.payment_status then
    perform public.send_push(
      array[v_requester_id],
      'Payment returned',
      coalesce(
        format('%s %s was returned to your wallet.', v_total, v_currency),
        'Your payment has been returned to your wallet.'
      ),
      '/wallet'
    );
  end if;

  return new;
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
      'Your request expires in about two hours if you have not chosen someone yet.',
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

create or replace function public.notify_completion_reminders(p_limit integer default 100)
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
    where r.status = 'completion_pending'::public.request_status
      and r.completion_confirm_by > now()
      and r.completion_confirm_by <= now() + interval '24 hours'
      and r.completion_reminder_sent_at is null
    order by r.completion_confirm_by
    limit p_limit
    for update skip locked
  loop
    perform public.send_push(
      array[v_row.requester_id],
      'Please confirm',
      'Your helper says the request is complete. Confirm or report a problem soon.',
      format('/engagement/%s', v_row.id)
    );

    update public.requests
    set completion_reminder_sent_at = now()
    where id = v_row.id;

    v_notified := v_notified + 1;
  end loop;

  return v_notified;
end;
$$;

create or replace function public.notify_requester_of_completion_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_helper_name text;
  v_helper_first text;
begin
  if new.status <> 'completion_pending'::public.request_status
     or old.status = new.status then
    return new;
  end if;

  select p.display_name into v_helper_name
  from public.profiles p
  where p.id = new.selected_user_id;

  v_helper_first := coalesce(public.display_first_name(v_helper_name), 'Your helper');

  perform public.send_push(
    array[new.requester_id],
    'Confirm completion',
    format('%s says the request is complete.', v_helper_first),
    format('/engagement/%s', new.id)
  );

  return new;
end;
$$;

create or replace function public.start_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_status public.request_status;
  v_requester_id uuid;
  v_helper_name text;
  v_helper_first text;
begin
  select status, requester_id
    into v_status, v_requester_id
  from public.requests
  where id = p_request_id and selected_user_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'in_progress' then
    return;
  end if;

  if v_status <> 'accepted' then
    raise exception 'only a selected request can be started' using errcode = '55000';
  end if;

  update public.requests
  set status = 'in_progress',
      started_at = now()
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'in_progress'::public.request_status,
    'start:' || p_request_id::text
  );

  select p.display_name into v_helper_name
  from public.profiles p
  where p.id = v_user_id;

  v_helper_first := coalesce(public.display_first_name(v_helper_name), 'Your helper');

  perform public.send_push(
    array[v_requester_id],
    'In progress',
    format('%s has started helping you.', v_helper_first),
    format('/engagement/%s', p_request_id)
  );
end;
$$;

create or replace function public.finalize_request_completion(
  p_request_id uuid,
  p_actor_id uuid,
  p_status_event_key text
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
  v_requester_name text;
  v_requester_first text;
begin
  if p_status_event_key is null or btrim(p_status_event_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  select r.status, r.selected_user_id, r.requester_id, r.payment_status
    into v_status, v_selected_user_id, v_requester_id, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'completed' then
    return false;
  end if;

  if v_status <> 'completion_pending' or v_payment = 'disputed' then
    return false;
  end if;

  update public.requests
  set status = 'completed'::public.request_status,
      completed_at = now(),
      started_at = coalesce(started_at, now()),
      completion_confirm_by = null
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_status,
    'completed'::public.request_status,
    p_status_event_key
  );

  if v_payment = 'pending' then
    perform public.apply_payment_transition(
      p_request_id,
      'released'::public.payment_status,
      'complete:' || p_request_id::text
    );
  end if;

  if v_selected_user_id is not null then
    update public.profiles
    set jobs_completed = jobs_completed + 1
    where id = v_selected_user_id;

    perform public.release_provider(v_selected_user_id);
  end if;

  update public.profiles
  set requests_completed = requests_completed + 1
  where id = v_requester_id;

  if p_status_event_key like 'confirm_complete:%' and v_selected_user_id is not null then
    select p.display_name into v_requester_name
    from public.profiles p
    where p.id = v_requester_id;

    v_requester_first := coalesce(public.display_first_name(v_requester_name), 'The requester');

    perform public.send_push(
      array[v_selected_user_id],
      'Payment released',
      format(
        '%s confirmed the request is complete. Your payment has been released.',
        v_requester_first
      ),
      format('/engagement/%s', p_request_id)
    );
  end if;

  return true;
end;
$$;

create or replace function public.auto_complete_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.request_status;
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_confirm_by timestamptz;
  v_payment public.payment_status;
  v_requester_name text;
  v_requester_first text;
  v_finalized boolean;
begin
  select r.status, r.requester_id, r.selected_user_id, r.completion_confirm_by, r.payment_status
    into v_status, v_requester_id, v_selected_user_id, v_confirm_by, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'completed' then
    return false;
  end if;

  if v_status <> 'completion_pending' or v_payment = 'disputed' then
    return false;
  end if;

  if v_confirm_by is null or v_confirm_by > now() then
    return false;
  end if;

  v_finalized := public.finalize_request_completion(
    p_request_id,
    v_requester_id,
    'auto_complete:' || p_request_id::text
  );

  if not v_finalized then
    return false;
  end if;

  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = v_requester_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'The requester');

  perform public.send_push(
    array[v_requester_id],
    'Request completed',
    'The confirmation window ended, so this request was marked complete. You can still leave a rating.',
    format('/rate/%s', p_request_id)
  );

  if v_selected_user_id is not null then
    perform public.send_push(
      array[v_selected_user_id],
      'Payment released',
      format(
        '%s did not confirm in time. The request was completed automatically and your payment has been released.',
        v_requester_first
      ),
      format('/engagement/%s', p_request_id)
    );
  end if;

  return true;
end;
$$;

-- Expiration (requester + responders)
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
    'Request expired',
    'This request expired before anyone was chosen. You can post it again.',
    format('/request/%s', p_request_id)
  );

  foreach v_responder_id in array v_responder_ids
  loop
    perform public.send_push(
      array[v_responder_id],
      'Request expired',
      'A request you responded to expired before anyone was chosen.',
      '/(tabs)/requests'
    );
  end loop;

  return true;
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
        'The person who posted this request cancelled it before anyone was chosen.',
        '/(tabs)/requests'
      );
    end loop;
  elsif p_actor_id = v_requester_id and v_selected_user_id is not null then
    perform public.send_push(
      array[v_selected_user_id],
      'Request cancelled',
      'The request was cancelled before it finished.',
      format('/engagement/%s', p_request_id)
    );
  elsif v_selected_user_id is not null and p_actor_id = v_selected_user_id then
    perform public.send_push(
      array[v_requester_id],
      'Request cancelled',
      'The person helping you cancelled. Any set-aside payment will be returned.',
      format('/engagement/%s', p_request_id)
    );
  end if;

  return true;
end;
$$;

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
  v_offered_amount numeric;
  v_quoted_amount numeric;
  v_agreed_provider_amount numeric;
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

  select r.status, r.payment_status, r.requester_id, r.expires_at, r.offered_amount
    into v_request_status, v_payment, v_requester_id, v_request_expires_at, v_offered_amount
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

  select rr.request_id, rr.responder_id, rr.status, rr.quoted_amount
    into v_locked_request_id, v_selected_user_id, v_response_status, v_quoted_amount
  from public.request_responses rr
  where rr.id = p_response_id
  for update;

  if v_locked_request_id is distinct from v_request_id
     or v_response_status is distinct from 'pending' then
    raise exception 'this response is no longer available' using errcode = '55000';
  end if;

  v_agreed_provider_amount := coalesce(nullif(v_quoted_amount, 0), v_offered_amount);

  if v_agreed_provider_amount is null or v_agreed_provider_amount <= 0 then
    raise exception 'this request has no agreed payment amount' using errcode = '55000';
  end if;

  select ua.request_id into v_attending
  from public.user_attendance ua
  where ua.user_id = v_selected_user_id
  for update;

  if v_attending is not null then
    raise exception 'This person is currently attending to another request.' using errcode = '55000';
  end if;

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

  update public.requests
  set status = 'accepted',
      accepted_at = now(),
      accepted_response_id = p_response_id,
      selected_user_id = v_selected_user_id,
      agreed_provider_amount = v_agreed_provider_amount
  where id = v_request_id
    and status = 'posted';

  if not found then
    raise exception 'this request is no longer open for selection' using errcode = '55000';
  end if;

  perform public.set_user_attendance(v_selected_user_id, v_request_id);

  insert into public.handshakes (request_id, response_id, requester_id, selected_user_id)
  values (v_request_id, p_response_id, v_requester_id, v_selected_user_id);

  if v_payment = 'locked' then
    perform public.align_request_escrow_to_agreed_amount(
      v_request_id,
      v_agreed_provider_amount,
      'handshake:' || v_request_id::text
    );

    perform public.apply_payment_transition(
      v_request_id,
      'pending'::public.payment_status,
      'handshake:' || v_request_id::text
    );
  end if;

  perform public.notify_responders_not_chosen(v_request_id, p_response_id);

  return v_request_id;
end;
$$;
