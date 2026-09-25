-- Requester confirmation window after a provider marks a service complete.
-- Deadline is enforced server-side (pg_cron); payment release is idempotent.

alter table public.requests
  add column if not exists completion_confirm_by timestamptz;

create function public.completion_confirmation_interval()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '72 hours';
$$;

revoke execute on function public.completion_confirmation_interval() from public, anon;
grant execute on function public.completion_confirmation_interval() to authenticated;

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

  return true;
end;
$$;

revoke all on function public.finalize_request_completion(uuid, uuid, text)
  from public, anon, authenticated;

create or replace function public.mark_service_complete(p_request_id uuid)
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

  if v_status in ('completion_pending', 'completed') then
    return;
  end if;

  if v_status not in ('accepted', 'in_progress') then
    raise exception 'only an active service can be marked complete' using errcode = '55000';
  end if;

  update public.requests
  set status = 'completion_pending',
      completion_confirm_by = now() + public.completion_confirmation_interval()
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'completion_pending',
    'mark_complete:' || p_request_id::text
  );
end;
$$;

create or replace function public.complete_request(p_request_id uuid)
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
  where id = p_request_id and requester_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'completed' then
    return;
  end if;

  if v_status <> 'completion_pending' then
    raise exception 'you can confirm completion only after your provider marks the service complete'
      using errcode = '55000';
  end if;

  perform public.finalize_request_completion(
    p_request_id,
    v_user_id,
    'confirm_complete:' || p_request_id::text
  );
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
  v_provider_id uuid;
  v_confirm_by timestamptz;
  v_provider_name text;
  v_requester_name text;
  v_finalized boolean;
begin
  select r.status, r.requester_id, r.provider_id, r.completion_confirm_by
    into v_status, v_requester_id, v_provider_id, v_confirm_by
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

  select p.display_name into v_provider_name
  from public.profiles p
  where p.id = v_provider_id;

  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = v_requester_id;

  perform public.send_push(
    array[v_requester_id],
    'Job marked complete',
    format(
      '%s did not respond in time, so this job was completed automatically. You can still leave a rating.',
      v_provider_name
    ),
    format('/rate/%s', p_request_id)
  );

  perform public.send_push(
    array[v_provider_id],
    'Payment released',
    format(
      '%s did not confirm in time. The job was completed automatically and your payment was released.',
      v_requester_name
    ),
    format('/engagement/%s', p_request_id)
  );

  return true;
end;
$$;

create or replace function public.auto_complete_due_requests(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_completed_count integer := 0;
begin
  if p_limit < 1 then
    raise exception 'limit must be at least 1' using errcode = '22023';
  end if;

  for v_request_id in
    select r.id
    from public.requests r
    where r.status = 'completion_pending'::public.request_status
      and r.completion_confirm_by is not null
      and r.completion_confirm_by <= now()
    order by r.completion_confirm_by
    limit p_limit
    for update skip locked
  loop
    if public.auto_complete_request(v_request_id) then
      v_completed_count := v_completed_count + 1;
    end if;
  end loop;

  return v_completed_count;
end;
$$;

revoke all on function public.auto_complete_request(uuid) from public, anon, authenticated;
revoke all on function public.auto_complete_due_requests(integer) from public, anon, authenticated;

revoke execute on function public.mark_service_complete(uuid) from public, anon;
grant execute on function public.mark_service_complete(uuid) to authenticated;

revoke execute on function public.complete_request(uuid) from public, anon;
grant execute on function public.complete_request(uuid) to authenticated;

create or replace function public.notify_requester_of_completion_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_name text;
begin
  if new.status <> 'completion_pending'::public.request_status
     or old.status = new.status then
    return new;
  end if;

  select p.display_name into v_provider_name
  from public.profiles p
  where p.id = new.provider_id;

  perform public.send_push(
    array[new.requester_id],
    'Confirm the job is done',
    format('%s says the service is complete. Confirm or report a problem.', v_provider_name),
    format('/engagement/%s', new.id)
  );

  return new;
end;
$$;

drop trigger if exists requests_notify_completion_pending on public.requests;

create trigger requests_notify_completion_pending
  after update of status on public.requests
  for each row
  when (
    old.status is distinct from 'completion_pending'::public.request_status
    and new.status = 'completion_pending'::public.request_status
  )
  execute function public.notify_requester_of_completion_pending();

drop function if exists public.get_engagement(uuid);

create function public.get_engagement(p_request_id uuid)
returns table (
  request_id uuid,
  category_slug text,
  description text,
  category_data jsonb,
  scheduled_for timestamptz,
  offered_amount numeric,
  quoted_amount numeric,
  currency text,
  request_status public.request_status,
  payment_status public.payment_status,
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  completion_confirm_by timestamptz,
  viewer_is_requester boolean,
  location_label text,
  request_latitude double precision,
  request_longitude double precision,
  provider_latitude double precision,
  provider_longitude double precision,
  counterparty_id uuid,
  counterparty_display_name text,
  counterparty_avatar_path text,
  counterparty_phone text,
  counterparty_rating_average numeric,
  counterparty_rating_count integer,
  rating_stars smallint,
  handshake_id uuid,
  handshake_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.assert_authenticated() as user_id)
  select
    r.id,
    r.category_slug,
    r.description,
    r.category_data,
    r.scheduled_for,
    r.offered_amount,
    accepted.quoted_amount,
    r.currency,
    r.status,
    r.payment_status,
    r.accepted_at,
    r.started_at,
    r.completed_at,
    r.completion_confirm_by,
    r.requester_id = me.user_id,
    r.location_label,
    extensions.ST_Y(r.location::extensions.geometry),
    extensions.ST_X(r.location::extensions.geometry),
    extensions.ST_Y(pa.location::extensions.geometry),
    extensions.ST_X(pa.location::extensions.geometry),
    counterparty.id,
    counterparty.display_name,
    counterparty.avatar_path,
    counterparty.phone,
    counterparty.rating_average,
    counterparty.rating_count,
    rating.stars,
    h.id,
    h.created_at
  from me
  join public.requests r
    on r.id = p_request_id
   and r.status in (
     'accepted',
     'in_progress',
     'completion_pending',
     'completed',
     'disputed',
     'no_show'
   )
   and me.user_id in (r.requester_id, r.provider_id)
  join public.profiles counterparty
    on counterparty.id = case when r.requester_id = me.user_id then r.provider_id else r.requester_id end
  left join public.request_responses accepted on accepted.id = r.accepted_response_id
  left join public.provider_availability pa
    on pa.user_id = r.provider_id
   and r.requester_id = me.user_id
   and r.status in ('accepted', 'in_progress', 'completion_pending')
  left join public.ratings rating on rating.request_id = r.id
  left join public.handshakes h on h.request_id = r.id;
$$;

revoke execute on function public.get_engagement(uuid) from public, anon;
grant execute on function public.get_engagement(uuid) to authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'auto-complete-due-requests';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'auto-complete-due-requests',
  '*/5 * * * *',
  $$select public.auto_complete_due_requests()$$
);
