-- Post-handshake service lifecycle: accepted → in_progress → completion_pending → completed.
-- Payment release and profile counters happen only in security-definer RPCs.

create table public.request_status_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete restrict,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  from_status public.request_status not null,
  to_status public.request_status not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (request_id, idempotency_key)
);

create index request_status_events_request_idx
  on public.request_status_events (request_id, created_at);

alter table public.request_status_events enable row level security;

create policy request_status_events_select_participant
  on public.request_status_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.requests r
      where r.id = request_id
        and auth.uid() in (r.requester_id, r.provider_id)
    )
  );

create function public.record_request_status_event(
  p_request_id uuid,
  p_actor_id uuid,
  p_from_status public.request_status,
  p_to_status public.request_status,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  insert into public.request_status_events (
    request_id,
    actor_id,
    from_status,
    to_status,
    idempotency_key
  )
  values (
    p_request_id,
    p_actor_id,
    p_from_status,
    p_to_status,
    p_idempotency_key
  )
  on conflict (request_id, idempotency_key) do nothing;
end;
$$;

revoke execute on function public.record_request_status_event(
  uuid, uuid, public.request_status, public.request_status, text
) from public, anon, authenticated;

create or replace function public.start_request(p_request_id uuid)
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
end;
$$;

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
  set status = 'completion_pending'
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
  v_provider_id uuid;
  v_status public.request_status;
  v_payment public.payment_status;
begin
  select status, provider_id, payment_status
    into v_status, v_provider_id, v_payment
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

  update public.requests
  set status = 'completed',
      completed_at = now(),
      started_at = coalesce(started_at, now())
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'completed',
    'confirm_complete:' || p_request_id::text
  );

  if v_payment = 'pending' then
    perform public.apply_payment_transition(
      p_request_id,
      'released',
      'complete:' || p_request_id::text
    );
  end if;

  update public.profiles set jobs_completed = jobs_completed + 1 where id = v_provider_id;
  update public.profiles set requests_completed = requests_completed + 1 where id = v_user_id;

  perform public.release_provider(v_provider_id);
end;
$$;

create or replace function public.report_service_problem(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_provider_id uuid;
  v_status public.request_status;
  v_payment public.payment_status;
begin
  select status, provider_id, payment_status
    into v_status, v_provider_id, v_payment
  from public.requests
  where id = p_request_id and requester_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'disputed' then
    return;
  end if;

  if v_status <> 'completion_pending' then
    raise exception 'a problem can only be reported while completion is pending'
      using errcode = '55000';
  end if;

  update public.requests
  set status = 'disputed'
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'disputed',
    'report_problem:' || p_request_id::text
  );

  if v_payment = 'pending' then
    perform public.apply_payment_transition(
      p_request_id,
      'disputed',
      'dispute:' || p_request_id::text
    );
  end if;

  perform public.release_provider(v_provider_id);
end;
$$;

revoke execute on function public.report_service_problem(uuid) from public, anon;
grant execute on function public.report_service_problem(uuid) to authenticated;
