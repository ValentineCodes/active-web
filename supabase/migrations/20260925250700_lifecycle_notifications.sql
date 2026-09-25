-- Lifecycle push notifications: cover request, provider, and client moments without
-- leaking pre-acceptance location or contact details in public copy.

alter table public.requests
  add column if not exists expiry_reminder_sent_at timestamptz,
  add column if not exists completion_reminder_sent_at timestamptz;

create or replace function public.format_bucketed_distance(p_distance_m integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_distance_m >= 1000 then
      format('about %s km away', trim(to_char(p_distance_m / 1000.0, 'FM9990.0')))
    else
      format('about %s m away', p_distance_m)
  end;
$$;

revoke all on function public.format_bucketed_distance(integer) from public, anon, authenticated;

-- One provider per call so distance in the body matches their position, never the
-- requester's typed address.
create or replace function public.notify_matching_providers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match record;
  v_label text;
begin
  if new.status <> 'searching' then
    return new;
  end if;

  select c.label into v_label
  from public.service_categories c
  where c.slug = new.category_slug;

  for v_match in
    select m.provider_id, public.bucket_distance_m(m.distance_m) as distance_m
    from public.matches(new.id) m
  loop
    perform public.send_push(
      array[v_match.provider_id],
      format('%s needed nearby', coalesce(v_label, 'Help')),
      format(
        '%s · %s',
        public.format_bucketed_distance(v_match.distance_m),
        left(new.description, 80)
      ),
      '/activity'
    );
  end loop;

  return new;
end;
$$;

create or replace function public.notify_requester_request_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text;
begin
  if new.status <> 'searching' then
    return new;
  end if;

  select c.label into v_label
  from public.service_categories c
  where c.slug = new.category_slug;

  perform public.send_push(
    array[new.requester_id],
    'Request is live',
    format(
      'Providers nearby can now see your %s request. We''ll notify you when someone responds.',
      lower(coalesce(v_label, 'service'))
    ),
    format('/request/%s', new.id)
  );

  return new;
end;
$$;

drop trigger if exists requests_notify_requester_published on public.requests;

create trigger requests_notify_requester_published
  after insert on public.requests
  for each row
  when (new.status = 'searching')
  execute function public.notify_requester_request_published();

create or replace function public.notify_requester_of_provider_selected()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_name text;
  v_eta integer;
  v_body text;
begin
  if new.status <> 'accepted'::public.request_status
     or old.status = new.status then
    return new;
  end if;

  select p.display_name into v_provider_name
  from public.profiles p
  where p.id = new.provider_id;

  select rr.eta_minutes into v_eta
  from public.request_responses rr
  where rr.id = new.accepted_response_id;

  v_body := format(
    '%s is your provider. Open the job for their contact details and your exact location.',
    coalesce(v_provider_name, 'Your provider')
  );

  if v_eta is not null then
    v_body := v_body || format(' They estimated about %s minutes.', v_eta);
  end if;

  perform public.send_push(
    array[new.requester_id],
    'Provider selected',
    v_body,
    format('/engagement/%s', new.id)
  );

  return new;
end;
$$;

drop trigger if exists requests_notify_requester_provider_selected on public.requests;

create trigger requests_notify_requester_provider_selected
  after update of status on public.requests
  for each row
  when (
    old.status is distinct from 'accepted'::public.request_status
    and new.status = 'accepted'::public.request_status
  )
  execute function public.notify_requester_of_provider_selected();

create or replace function public.notify_payment_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_id uuid;
  v_provider_id uuid;
  v_total numeric;
  v_currency text;
begin
  select r.requester_id, r.provider_id, r.currency
    into v_requester_id, v_provider_id, v_currency
  from public.requests r
  where r.id = new.request_id;

  select re.total into v_total
  from public.request_escrow re
  where re.request_id = new.request_id;

  if new.to_status = 'locked'::public.payment_status
     and new.idempotency_key like 'create:%' then
    perform public.send_push(
      array[v_requester_id],
      'Request funded',
      coalesce(
        format('We secured %s %s for this job in your wallet.', v_total, v_currency),
        'Your payment is secured for this job.'
      ),
      format('/request/%s', new.request_id)
    );
  elsif new.to_status = 'refunded'::public.payment_status then
    perform public.send_push(
      array[v_requester_id],
      'Refund issued',
      coalesce(
        format('%s %s was returned to your wallet.', v_total, v_currency),
        'Your payment was returned to your wallet.'
      ),
      '/wallet'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists payment_transitions_notify on public.payment_transitions;

create trigger payment_transitions_notify
  after insert on public.payment_transitions
  for each row
  when (new.to_status in ('locked', 'refunded'))
  execute function public.notify_payment_transition();

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
  v_provider_id uuid;
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

  if v_status <> 'searching' then
    return false;
  end if;

  if v_expires_at is null or v_expires_at > now() then
    return false;
  end if;

  if exists (select 1 from public.handshakes h where h.request_id = p_request_id) then
    return false;
  end if;

  select coalesce(array_agg(distinct rr.provider_id), '{}')
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
    'Request expired',
    'No provider was selected before the deadline. You can post the request again.',
    format('/request/%s', p_request_id)
  );

  foreach v_provider_id in array v_responder_ids
  loop
    perform public.send_push(
      array[v_provider_id],
      'Request expired',
      'A request you responded to expired before a provider was selected.',
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
    where r.status = 'searching'::public.request_status
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
      'Request expiring soon',
      'Your open request will expire in about two hours if no provider is selected.',
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

revoke all on function public.notify_expiring_requests(integer) from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'notify-expiring-requests';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'notify-expiring-requests',
  '*/15 * * * *',
  $$select public.notify_expiring_requests()$$
);

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
      'Confirm the job is done',
      'Your provider marked this job complete. Please confirm or report a problem soon.',
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

revoke all on function public.notify_completion_reminders(integer) from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'notify-completion-reminders';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'notify-completion-reminders',
  '0 * * * *',
  $$select public.notify_completion_reminders()$$
);

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
  v_requester_id uuid;
  v_payment public.payment_status;
begin
  if p_status_event_key is null or btrim(p_status_event_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if p_payment_idempotency_key is null or btrim(p_payment_idempotency_key) = '' then
    raise exception 'payment idempotency key is required' using errcode = '22023';
  end if;

  select r.status, r.provider_id, r.requester_id, r.payment_status
    into v_status, v_provider_id, v_requester_id, v_payment
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

  if p_actor_id = v_requester_id and v_provider_id is not null then
    perform public.send_push(
      array[v_provider_id],
      'Request cancelled',
      'The client cancelled this job before it finished.',
      format('/engagement/%s', p_request_id)
    );
  elsif p_actor_id = v_provider_id then
    perform public.send_push(
      array[v_requester_id],
      'Service cancelled',
      'Your provider cancelled this job. Any secured payment will be refunded.',
      format('/engagement/%s', p_request_id)
    );
  end if;

  return true;
end;
$$;

revoke all on function public.finalize_request_cancellation(uuid, uuid, text, text)
  from public, anon, authenticated;

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
  v_provider_name text;
begin
  select status, requester_id into v_status, v_requester_id
  from public.requests
  where id = p_request_id and provider_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'in_progress' then
    return;
  end if;

  if v_status <> 'accepted' then
    raise exception 'only an accepted request can be started' using errcode = '55000';
  end if;

  update public.requests
  set status = 'in_progress',
      started_at = now()
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'in_progress',
    'start:' || p_request_id::text
  );

  select p.display_name into v_provider_name
  from public.profiles p
  where p.id = v_user_id;

  perform public.send_push(
    array[v_requester_id],
    'Provider is on the way',
    format('%s started the job and is heading to you.', coalesce(v_provider_name, 'Your provider')),
    format('/engagement/%s', p_request_id)
  );
end;
$$;

revoke execute on function public.start_request(uuid) from public, anon;
grant execute on function public.start_request(uuid) to authenticated;

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
  v_provider_id uuid;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_requester_name text;
begin
  if p_status_event_key is null or btrim(p_status_event_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  select r.status, r.provider_id, r.requester_id, r.payment_status
    into v_status, v_provider_id, v_requester_id, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'completed' then
    return false;
  end if;

  if v_status <> 'completion_pending' then
    return false;
  end if;

  update public.requests
  set status = 'completed',
      completed_at = now(),
      started_at = coalesce(started_at, now())
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_status,
    'completed',
    p_status_event_key
  );

  if v_payment = 'pending' then
    perform public.apply_payment_transition(
      p_request_id,
      'released',
      'complete:' || p_request_id::text
    );
  end if;

  update public.profiles
  set jobs_completed = jobs_completed + 1
  where id = v_provider_id;

  update public.profiles
  set requests_completed = requests_completed + 1
  where id = v_requester_id;

  perform public.release_provider(v_provider_id);

  if p_status_event_key like 'confirm_complete:%' then
    select p.display_name into v_requester_name
    from public.profiles p
    where p.id = v_requester_id;

    perform public.send_push(
      array[v_provider_id],
      'Payment released',
      format(
        '%s confirmed the job is done. Your payment was released to your wallet.',
        coalesce(v_requester_name, 'The client')
      ),
      format('/engagement/%s', p_request_id)
    );
  end if;

  return true;
end;
$$;

revoke all on function public.finalize_request_completion(uuid, uuid, text)
  from public, anon, authenticated;

create or replace function public.admin_resolve_service_problem(
  p_problem_id uuid,
  p_outcome text,
  p_admin_note text,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.dispute_admin_resolutions%rowtype;
  v_problem public.service_problems%rowtype;
  v_status public.request_status;
  v_payment public.payment_status;
  v_provider_id uuid;
  v_requester_id uuid;
  v_resolution text;
  v_request_after public.request_status;
  v_payment_after public.payment_status;
  v_push_title text;
  v_push_body text;
begin
  perform public.assert_admin_caller();

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if p_admin_note is null or btrim(p_admin_note) = '' then
    raise exception 'an admin note is required' using errcode = '22023';
  end if;

  if p_outcome not in ('refund_requester', 'pay_provider', 'resume_service') then
    raise exception 'unsupported admin outcome' using errcode = '22023';
  end if;

  select *
    into v_existing
  from public.dispute_admin_resolutions dar
  where dar.idempotency_key = p_idempotency_key;

  if v_existing.id is not null then
    return;
  end if;

  select sp.*
    into v_problem
  from public.service_problems sp
  where sp.id = p_problem_id
  for update;

  if v_problem.id is null or v_problem.status <> 'open' then
    raise exception 'there is no open dispute on this problem' using errcode = '55000';
  end if;

  select r.status, r.payment_status, r.provider_id, r.requester_id
    into v_status, v_payment, v_provider_id, v_requester_id
  from public.requests r
  where r.id = v_problem.request_id
  for update;

  if v_status <> 'disputed' then
    raise exception 'request is not disputed' using errcode = '55000';
  end if;

  if p_outcome = 'refund_requester' then
    v_resolution := 'admin_refund_requester';

    update public.request_responses
    set status = case
                   when status = 'accepted' then 'declined'::public.response_status
                   else 'expired'::public.response_status
                 end,
        resolved_at = coalesce(resolved_at, now())
    where request_id = v_problem.request_id
      and status in ('pending', 'accepted');

    update public.requests
    set status = 'cancelled',
        cancelled_at = now(),
        provider_id = null,
        accepted_response_id = null,
        completion_confirm_by = null
    where id = v_problem.request_id;

    perform public.record_request_status_event(
      v_problem.request_id,
      v_problem.reported_by,
      v_status,
      'cancelled',
      'admin_dispute:' || p_idempotency_key
    );

    if v_payment in ('locked', 'pending', 'disputed') then
      perform public.apply_payment_transition(
        v_problem.request_id,
        'refunded',
        'admin_dispute_refund:' || p_idempotency_key
      );
    end if;

    if v_provider_id is not null then
      perform public.release_provider(v_provider_id);
    end if;

    v_request_after := 'cancelled';
    v_payment_after := case
      when v_payment in ('locked', 'pending', 'disputed') then 'refunded'::public.payment_status
      else v_payment
    end;
    v_push_title := 'Dispute resolved';
    v_push_body := 'Support resolved the dispute in your favor. Any secured payment was refunded.';
  elsif p_outcome = 'pay_provider' then
    v_resolution := 'admin_pay_provider';

    update public.requests
    set status = 'completed',
        completed_at = now(),
        started_at = coalesce(started_at, now()),
        completion_confirm_by = null
    where id = v_problem.request_id;

    perform public.record_request_status_event(
      v_problem.request_id,
      v_problem.reported_by,
      v_status,
      'completed',
      'admin_dispute:' || p_idempotency_key
    );

    if v_payment in ('locked', 'pending', 'disputed') then
      perform public.apply_payment_transition(
        v_problem.request_id,
        'released',
        'admin_dispute_release:' || p_idempotency_key
      );
    end if;

    update public.profiles
    set jobs_completed = jobs_completed + 1
    where id = v_provider_id;

    update public.profiles
    set requests_completed = requests_completed + 1
    where id = v_requester_id;

    if v_provider_id is not null then
      perform public.release_provider(v_provider_id);
    end if;

    v_request_after := 'completed';
    v_payment_after := case
      when v_payment in ('locked', 'pending', 'disputed') then 'released'::public.payment_status
      else v_payment
    end;
    v_push_title := 'Dispute resolved';
    v_push_body := 'Support resolved the dispute. Payment was released to the provider.';
  else
    v_resolution := 'admin_resume_service';

    update public.requests
    set status = v_problem.status_before,
        completion_confirm_by = null
    where id = v_problem.request_id;

    perform public.record_request_status_event(
      v_problem.request_id,
      v_problem.reported_by,
      v_status,
      v_problem.status_before,
      'admin_dispute:' || p_idempotency_key
    );

    if v_problem.payment_before in ('locked', 'pending')
       and v_payment = 'disputed' then
      perform public.apply_payment_transition(
        v_problem.request_id,
        v_problem.payment_before,
        'admin_dispute_resume:' || p_idempotency_key
      );
      v_payment_after := v_problem.payment_before;
    else
      v_payment_after := v_payment;
    end if;

    v_request_after := v_problem.status_before;
    v_push_title := 'Dispute update';
    v_push_body := 'Support resolved the dispute. The job can continue.';
  end if;

  update public.service_problems
  set status = 'resolved',
      resolution = v_resolution,
      resolved_at = now()
  where id = v_problem.id;

  insert into public.dispute_admin_resolutions (
    service_problem_id,
    request_id,
    outcome,
    admin_note,
    idempotency_key,
    request_status_after,
    payment_status_after
  )
  values (
    v_problem.id,
    v_problem.request_id,
    p_outcome,
    btrim(p_admin_note),
    p_idempotency_key,
    v_request_after,
    v_payment_after
  );

  perform public.send_push(
    array[v_requester_id],
    v_push_title,
    v_push_body,
    format('/engagement/%s', v_problem.request_id)
  );

  if v_provider_id is not null then
    perform public.send_push(
      array[v_provider_id],
      v_push_title,
      v_push_body,
      format('/engagement/%s', v_problem.request_id)
    );
  end if;
end;
$$;

revoke all on function public.admin_resolve_service_problem(uuid, text, text, text)
  from public, anon, authenticated;
