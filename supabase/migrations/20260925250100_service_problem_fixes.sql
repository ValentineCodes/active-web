-- Allow contest to restore pre-dispute payment; only treat post-report GPS as active.

create or replace function public.provider_location_recently_updated(
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

create or replace function public.provider_location_updated_since_report(
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

create or replace function public.apply_payment_transition(
  p_request_id uuid,
  p_to_status public.payment_status,
  p_idempotency_key text
)
returns public.payment_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.payment_status;
  v_allowed boolean;
  v_existing public.payment_status;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  select pt.to_status into v_existing
  from public.payment_transitions pt
  where pt.request_id = p_request_id
    and pt.idempotency_key = p_idempotency_key;

  if v_existing is not null then
    return v_existing;
  end if;

  select payment_status into v_from
  from public.requests
  where id = p_request_id
  for update;

  if v_from is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  v_allowed := case
    when v_from = 'not_required' and p_to_status = 'not_required' then true
    when v_from = 'available' and p_to_status in ('locked', 'not_required') then true
    when v_from = 'locked' and p_to_status in ('pending', 'refunded', 'disputed') then true
    when v_from = 'pending' and p_to_status in ('released', 'refunded', 'disputed') then true
    when v_from = 'released' and p_to_status = 'disputed' then true
    when v_from = 'refunded' and p_to_status = 'disputed' then true
    when v_from = 'disputed' and p_to_status in ('released', 'refunded', 'pending', 'locked') then true
    else false
  end;

  if not v_allowed then
    raise exception 'payment cannot move from % to %', v_from, p_to_status using errcode = '55000';
  end if;

  insert into public.payment_transitions (request_id, idempotency_key, from_status, to_status)
  values (p_request_id, p_idempotency_key, v_from, p_to_status);

  update public.requests
  set payment_status = p_to_status
  where id = p_request_id;

  return p_to_status;
end;
$$;

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
