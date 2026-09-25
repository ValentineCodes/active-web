-- No-show and provider-unreachable handling as extensions of report_service_problem.
-- Dispute outcomes are server-authoritative (pg_cron + security-definer RPCs).

create type public.service_problem_kind as enum (
  'completion_issue',
  'provider_no_show',
  'client_no_show',
  'provider_unreachable'
);

create table public.service_problems (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete restrict,
  kind public.service_problem_kind not null,
  reported_by uuid not null references public.profiles (id) on delete restrict,
  status text not null check (status in ('open', 'resolved')),
  status_before public.request_status not null,
  payment_before public.payment_status not null,
  respond_by timestamptz,
  resolution text check (
    resolution is null
    or resolution in (
      'auto_client_refund',
      'auto_provider_paid',
      'contested',
      'manual'
    )
  ),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index service_problems_one_open_per_request
  on public.service_problems (request_id)
  where status = 'open';

create index service_problems_respond_by_idx
  on public.service_problems (respond_by)
  where status = 'open' and respond_by is not null;

alter table public.service_problems enable row level security;

create policy service_problems_select_participant
  on public.service_problems
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

create function public.service_problem_response_interval()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '24 hours';
$$;

revoke execute on function public.service_problem_response_interval() from public, anon;
grant execute on function public.service_problem_response_interval() to authenticated;

create function public.provider_location_recently_updated(
  p_provider_id uuid,
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_availability pa
    where pa.user_id = p_provider_id
      and pa.committed_request_id = p_request_id
      and pa.location is not null
      and pa.updated_at > now() - interval '15 minutes'
  );
$$;

revoke all on function public.provider_location_recently_updated(uuid, uuid)
  from public, anon, authenticated;

create function public.provider_location_updated_since_report(
  p_provider_id uuid,
  p_request_id uuid,
  p_reported_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_availability pa
    where pa.user_id = p_provider_id
      and pa.committed_request_id = p_request_id
      and pa.location is not null
      and pa.updated_at > p_reported_at
      and pa.updated_at > now() - interval '15 minutes'
  );
$$;

revoke all on function public.provider_location_updated_since_report(uuid, uuid, timestamptz)
  from public, anon, authenticated;

create or replace function public.finalize_provider_no_show_resolution(
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

  if v_status = 'no_show' then
    return false;
  end if;

  if v_status <> 'disputed' then
    return false;
  end if;

  update public.request_responses
  set status = 'declined'::public.response_status,
      resolved_at = coalesce(resolved_at, now())
  where request_id = p_request_id
    and status = 'accepted';

  update public.requests
  set status = 'no_show',
      completion_confirm_by = null
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_status,
    'no_show',
    p_status_event_key
  );

  if v_payment in ('locked', 'pending', 'disputed') then
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

revoke all on function public.finalize_provider_no_show_resolution(uuid, uuid, text, text)
  from public, anon, authenticated;

create or replace function public.finalize_client_no_show_resolution(
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

  if v_status = 'no_show' then
    return false;
  end if;

  if v_status <> 'disputed' then
    return false;
  end if;

  update public.requests
  set status = 'no_show',
      completion_confirm_by = null
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_status,
    'no_show',
    p_status_event_key
  );

  if v_payment in ('locked', 'pending', 'disputed') then
    perform public.apply_payment_transition(
      p_request_id,
      'released',
      p_payment_idempotency_key
    );
  end if;

  if v_provider_id is not null then
    perform public.release_provider(v_provider_id);
  end if;

  return true;
end;
$$;

revoke all on function public.finalize_client_no_show_resolution(uuid, uuid, text, text)
  from public, anon, authenticated;

create or replace function public.contest_service_problem(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_requester_id uuid;
  v_provider_id uuid;
  v_status public.request_status;
  v_problem public.service_problems%rowtype;
begin
  select r.requester_id, r.provider_id, r.status
    into v_requester_id, v_provider_id, v_status
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_requester_id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_user_id not in (v_requester_id, v_provider_id) then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status <> 'disputed' then
    raise exception 'there is no open problem on this request' using errcode = '55000';
  end if;

  select *
    into v_problem
  from public.service_problems sp
  where sp.request_id = p_request_id
    and sp.status = 'open'
  for update;

  if not found then
    raise exception 'there is no open problem on this request' using errcode = '55000';
  end if;

  if v_problem.reported_by = v_user_id then
    raise exception 'you cannot respond to your own report' using errcode = '55000';
  end if;

  if v_problem.respond_by is not null and v_problem.respond_by <= now() then
    raise exception 'the response window has closed' using errcode = '55000';
  end if;

  update public.service_problems
  set status = 'resolved',
      resolution = 'contested',
      resolved_at = now()
  where id = v_problem.id;

  update public.requests
  set status = v_problem.status_before,
      completion_confirm_by = null
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_user_id,
    'disputed',
    v_problem.status_before,
    'contest_problem:' || p_request_id::text
  );

  if v_problem.payment_before in ('locked', 'pending')
     and exists (
       select 1
       from public.requests r
       where r.id = p_request_id
         and r.payment_status = 'disputed'
     ) then
    perform public.apply_payment_transition(
      p_request_id,
      v_problem.payment_before,
      'contest_problem:' || p_request_id::text
    );
  end if;
end;
$$;

revoke execute on function public.contest_service_problem(uuid) from public, anon;
grant execute on function public.contest_service_problem(uuid) to authenticated;

drop function if exists public.report_service_problem(uuid);

create or replace function public.report_service_problem(
  p_request_id uuid,
  p_kind public.service_problem_kind default 'completion_issue'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_requester_id uuid;
  v_provider_id uuid;
  v_status public.request_status;
  v_payment public.payment_status;
  v_provider_name text;
  v_requester_name text;
begin
  select r.requester_id, r.provider_id, r.status, r.payment_status
    into v_requester_id, v_provider_id, v_status, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_requester_id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'disputed' then
    return;
  end if;

  if p_kind = 'completion_issue' then
    if v_user_id <> v_requester_id then
      raise exception 'request not found' using errcode = 'P0002';
    end if;

    if v_status <> 'completion_pending' then
      raise exception 'a completion problem can only be reported while completion is pending'
        using errcode = '55000';
    end if;
  elsif p_kind in ('provider_no_show', 'provider_unreachable') then
    if v_user_id <> v_requester_id then
      raise exception 'request not found' using errcode = 'P0002';
    end if;

    if v_status not in ('accepted', 'in_progress') then
      raise exception 'a no-show can only be reported during an active service'
        using errcode = '55000';
    end if;

    if p_kind = 'provider_unreachable'
       and public.provider_location_recently_updated(v_provider_id, p_request_id) then
      raise exception
        'your provider''s location was updated recently; try calling or messaging before reporting them unreachable'
        using errcode = '55000';
    end if;
  elsif p_kind = 'client_no_show' then
    if v_user_id <> v_provider_id then
      raise exception 'request not found' using errcode = 'P0002';
    end if;

    if v_status not in ('accepted', 'in_progress') then
      raise exception 'a no-show can only be reported during an active service'
        using errcode = '55000';
    end if;
  else
    raise exception 'unsupported problem kind' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.service_problems sp
    where sp.request_id = p_request_id
      and sp.status = 'open'
  ) then
    raise exception 'a problem is already open on this request' using errcode = '55000';
  end if;

  insert into public.service_problems (
    request_id,
    kind,
    reported_by,
    status,
    status_before,
    payment_before,
    respond_by
  )
  values (
    p_request_id,
    p_kind,
    v_user_id,
    'open',
    v_status,
    v_payment,
    case
      when p_kind in ('provider_no_show', 'client_no_show', 'provider_unreachable')
        then now() + public.service_problem_response_interval()
      else null
    end
  );

  update public.requests
  set status = 'disputed'
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'disputed',
    'report_problem:' || p_kind::text || ':' || p_request_id::text
  );

  if v_payment in ('locked', 'pending') then
    perform public.apply_payment_transition(
      p_request_id,
      'disputed',
      'dispute:' || p_kind::text || ':' || p_request_id::text
    );
  end if;

  if p_kind = 'completion_issue' and v_provider_id is not null then
    perform public.release_provider(v_provider_id);
  end if;

  select p.display_name into v_provider_name
  from public.profiles p
  where p.id = v_provider_id;

  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = v_requester_id;

  if p_kind = 'provider_no_show' then
    perform public.send_push(
      array[v_provider_id],
      'No-show reported',
      format('%s reported that you did not show up. Respond within 24 hours.', v_requester_name),
      format('/engagement/%s', p_request_id)
    );
  elsif p_kind = 'provider_unreachable' then
    perform public.send_push(
      array[v_provider_id],
      'Client can''t reach you',
      format('%s is trying to reach you for this job. Open the app or call them back.', v_requester_name),
      format('/engagement/%s', p_request_id)
    );
  elsif p_kind = 'client_no_show' then
    perform public.send_push(
      array[v_requester_id],
      'No-show reported',
      format('%s reported that you were not available. Respond within 24 hours.', v_provider_name),
      format('/engagement/%s', p_request_id)
    );
  end if;
end;
$$;

revoke execute on function public.report_service_problem(uuid, public.service_problem_kind) from public, anon;
grant execute on function public.report_service_problem(uuid, public.service_problem_kind) to authenticated;

create or replace function public.resolve_service_problem(p_problem_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problem public.service_problems%rowtype;
  v_provider_id uuid;
  v_resolved boolean := false;
begin
  select sp.*
    into v_problem
  from public.service_problems sp
  where sp.id = p_problem_id
  for update;

  if v_problem.id is null or v_problem.status <> 'open' then
    return false;
  end if;

  if v_problem.respond_by is null or v_problem.respond_by > now() then
    return false;
  end if;

  select r.provider_id into v_provider_id
  from public.requests r
  where r.id = v_problem.request_id
  for update;

  if v_problem.kind in ('provider_no_show', 'provider_unreachable') then
    if public.provider_location_updated_since_report(
      v_provider_id,
      v_problem.request_id,
      v_problem.created_at
    ) then
      return false;
    end if;

    v_resolved := public.finalize_provider_no_show_resolution(
      v_problem.request_id,
      v_problem.reported_by,
      'auto_no_show:' || v_problem.id::text,
      'no_show_refund:' || v_problem.id::text
    );
  elsif v_problem.kind = 'client_no_show' then
    v_resolved := public.finalize_client_no_show_resolution(
      v_problem.request_id,
      v_problem.reported_by,
      'auto_no_show:' || v_problem.id::text,
      'no_show_release:' || v_problem.id::text
    );
  else
    return false;
  end if;

  if v_resolved then
    update public.service_problems
    set status = 'resolved',
        resolution = case
                       when v_problem.kind = 'client_no_show' then 'auto_provider_paid'
                       else 'auto_client_refund'
                     end,
        resolved_at = now()
    where id = v_problem.id;
  end if;

  return v_resolved;
end;
$$;

revoke all on function public.resolve_service_problem(uuid) from public, anon, authenticated;

create or replace function public.resolve_due_service_problems(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problem_id uuid;
  v_resolved_count integer := 0;
begin
  if p_limit < 1 then
    raise exception 'limit must be at least 1' using errcode = '22023';
  end if;

  for v_problem_id in
    select sp.id
    from public.service_problems sp
    where sp.status = 'open'
      and sp.respond_by is not null
      and sp.respond_by <= now()
      and sp.kind in ('provider_no_show', 'client_no_show', 'provider_unreachable')
    order by sp.respond_by
    limit p_limit
    for update skip locked
  loop
    if public.resolve_service_problem(v_problem_id) then
      v_resolved_count := v_resolved_count + 1;
    end if;
  end loop;

  return v_resolved_count;
end;
$$;

revoke all on function public.resolve_due_service_problems(integer) from public, anon, authenticated;

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
  service_problem_kind public.service_problem_kind,
  service_problem_respond_by timestamptz,
  service_problem_reported_by_me boolean,
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
    sp.kind,
    sp.respond_by,
    sp.reported_by = me.user_id,
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
   and r.status in ('accepted', 'in_progress', 'completion_pending', 'disputed')
  left join public.service_problems sp
    on sp.request_id = r.id
   and sp.status = 'open'
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
  where jobname = 'resolve-due-service-problems';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'resolve-due-service-problems',
  '*/5 * * * *',
  $$select public.resolve_due_service_problems()$$
);
