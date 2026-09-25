-- MVP disputes: description/evidence on service_problems, admin-only resolution audit trail.

alter table public.service_problems
  add column if not exists description text not null default '',
  add column if not exists evidence_paths text[] not null default '{}';

alter table public.service_problems
  drop constraint if exists service_problems_resolution_check;

alter table public.service_problems
  add constraint service_problems_resolution_check check (
    resolution is null
    or resolution in (
      'auto_client_refund',
      'auto_provider_paid',
      'contested',
      'manual',
      'admin_refund_requester',
      'admin_pay_provider',
      'admin_resume_service'
    )
  );

create table public.dispute_admin_resolutions (
  id uuid primary key default gen_random_uuid(),
  service_problem_id uuid not null references public.service_problems (id) on delete restrict,
  request_id uuid not null references public.requests (id) on delete restrict,
  outcome text not null check (outcome in ('refund_requester', 'pay_provider', 'resume_service')),
  admin_note text not null check (char_length(btrim(admin_note)) >= 1),
  idempotency_key text not null unique,
  request_status_after public.request_status not null,
  payment_status_after public.payment_status not null,
  created_at timestamptz not null default now()
);

create index dispute_admin_resolutions_request_idx
  on public.dispute_admin_resolutions (request_id, created_at);

alter table public.dispute_admin_resolutions enable row level security;

create function public.assert_dispute_evidence_paths(
  p_reporter_id uuid,
  p_paths text[]
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_path text;
  v_prefix text := p_reporter_id::text || '/';
begin
  if p_paths is null then
    return;
  end if;

  if coalesce(array_length(p_paths, 1), 0) > 4 then
    raise exception 'at most four evidence photos are allowed' using errcode = '22023';
  end if;

  foreach v_path in array p_paths loop
    if v_path is null or btrim(v_path) = '' then
      raise exception 'evidence path cannot be empty' using errcode = '22023';
    end if;

    if not (v_path like v_prefix || '%') then
      raise exception 'evidence must be uploaded by the reporter' using errcode = '55000';
    end if;
  end loop;
end;
$$;

revoke all on function public.assert_dispute_evidence_paths(uuid, text[])
  from public, anon, authenticated;

create function public.service_problem_requires_description(p_kind public.service_problem_kind)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_kind in (
    'completion_issue',
    'service_not_completed',
    'service_differs_from_request',
    'other'
  );
$$;

revoke all on function public.service_problem_requires_description(public.service_problem_kind)
  from public, anon, authenticated;

create or replace function public.assert_admin_caller()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user <> 'postgres'
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_admin_caller() from public, anon, authenticated;

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
end;
$$;

revoke all on function public.admin_resolve_service_problem(uuid, text, text, text)
  from public, anon, authenticated;

drop function if exists public.report_service_problem(uuid, public.service_problem_kind);

create or replace function public.report_service_problem(
  p_request_id uuid,
  p_kind public.service_problem_kind default 'completion_issue',
  p_description text default '',
  p_evidence_paths text[] default '{}'
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
  v_description text := coalesce(p_description, '');
  v_evidence text[] := coalesce(p_evidence_paths, '{}');
begin
  perform public.assert_dispute_evidence_paths(v_user_id, v_evidence);

  if public.service_problem_requires_description(p_kind)
     and char_length(btrim(v_description)) < 10 then
    raise exception 'please describe what went wrong (at least 10 characters)' using errcode = '22023';
  end if;

  select r.requester_id, r.provider_id, r.status, r.payment_status
    into v_requester_id, v_provider_id, v_status, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_requester_id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_user_id not in (v_requester_id, v_provider_id) then
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
      raise exception 'this problem can only be reported during an active service'
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
      raise exception 'this problem can only be reported during an active service'
        using errcode = '55000';
    end if;
  elsif p_kind = 'service_not_completed' then
    if v_status not in ('accepted', 'in_progress', 'completion_pending') then
      raise exception 'this problem can only be reported during an active service'
        using errcode = '55000';
    end if;
  elsif p_kind = 'service_differs_from_request' then
    if v_status not in ('in_progress', 'completion_pending') then
      raise exception 'this problem can only be reported once work has started'
        using errcode = '55000';
    end if;
  elsif p_kind = 'other' then
    if v_status not in ('accepted', 'in_progress', 'completion_pending') then
      raise exception 'this problem can only be reported during an active service'
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
    respond_by,
    description,
    evidence_paths
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
    end,
    btrim(v_description),
    v_evidence
  );

  update public.requests
  set status = 'disputed',
      completion_confirm_by = null
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

  if p_kind in ('completion_issue', 'service_not_completed', 'service_differs_from_request', 'other')
     and v_provider_id is not null then
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
  elsif p_kind in (
    'completion_issue',
    'service_not_completed',
    'service_differs_from_request',
    'other'
  ) then
    perform public.send_push(
      array[case when v_user_id = v_requester_id then v_provider_id else v_requester_id end],
      'Problem reported on this job',
      'Support will review the report. Payment stays locked until the dispute is resolved.',
      format('/engagement/%s', p_request_id)
    );
  end if;
end;
$$;

revoke execute on function public.report_service_problem(
  uuid,
  public.service_problem_kind,
  text,
  text[]
) from public, anon;
grant execute on function public.report_service_problem(
  uuid,
  public.service_problem_kind,
  text,
  text[]
) to authenticated;

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
  service_problem_description text,
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
    sp.description,
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
