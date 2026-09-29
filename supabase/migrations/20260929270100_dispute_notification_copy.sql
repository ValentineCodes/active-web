-- Dispute/problem notifications and selected_user_id alignment.

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
  v_selected_user_id uuid;
  v_status public.request_status;
  v_payment public.payment_status;
  v_helper_name text;
  v_requester_name text;
  v_description text := coalesce(p_description, '');
  v_evidence text[] := coalesce(p_evidence_paths, '{}');
begin
  perform public.assert_dispute_evidence_paths(v_user_id, v_evidence);

  if public.service_problem_requires_description(p_kind)
     and char_length(btrim(v_description)) < 10 then
    raise exception 'please describe what went wrong (at least 10 characters)' using errcode = '22023';
  end if;

  select r.requester_id, r.selected_user_id, r.status, r.payment_status
    into v_requester_id, v_selected_user_id, v_status, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_requester_id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_user_id not in (v_requester_id, v_selected_user_id) then
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
       and public.provider_location_recently_updated(v_selected_user_id, p_request_id) then
      raise exception
        'your provider''s location was updated recently; try calling or messaging before reporting them unreachable'
        using errcode = '55000';
    end if;
  elsif p_kind = 'client_no_show' then
    if v_user_id <> v_selected_user_id then
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
     and v_selected_user_id is not null then
    perform public.release_provider(v_selected_user_id);
  end if;

  select p.display_name into v_helper_name
  from public.profiles p
  where p.id = v_selected_user_id;

  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = v_requester_id;

  if p_kind = 'provider_no_show' then
    perform public.send_push(
      array[v_selected_user_id],
      'Could not meet up',
      format('%s reported they could not meet up for this request. Open the request to respond.', coalesce(public.display_first_name(v_requester_name), 'The requester')),
      format('/engagement/%s', p_request_id)
    );
  elsif p_kind = 'provider_unreachable' then
    perform public.send_push(
      array[v_selected_user_id],
      'Trying to reach you',
      format('%s is trying to reach you about this request.', coalesce(public.display_first_name(v_requester_name), 'The requester')),
      format('/engagement/%s', p_request_id)
    );
  elsif p_kind = 'client_no_show' then
    perform public.send_push(
      array[v_requester_id],
      'Could not meet up',
      format('%s reported they could not meet up for this request.', coalesce(public.display_first_name(v_helper_name), 'Your helper')),
      format('/engagement/%s', p_request_id)
    );
  elsif p_kind in (
    'completion_issue',
    'service_not_completed',
    'service_differs_from_request',
    'other'
  ) then
    perform public.send_push(
      array[case when v_user_id = v_requester_id then v_selected_user_id else v_requester_id end],
      'Problem reported',
      'There is an open problem on this request. Payment stays on hold until it is resolved.',
      format('/engagement/%s', p_request_id)
    );
  end if;
end;
$$;



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
  v_selected_user_id uuid;
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

  select r.status, r.payment_status, r.selected_user_id, r.requester_id
    into v_status, v_payment, v_selected_user_id, v_requester_id
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
        selected_user_id = null,
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

    if v_selected_user_id is not null then
      perform public.release_provider(v_selected_user_id);
    end if;

    v_request_after := 'cancelled';
    v_payment_after := case
      when v_payment in ('locked', 'pending', 'disputed') then 'refunded'::public.payment_status
      else v_payment
    end;
    v_push_title := 'Dispute update';
    v_push_body := 'Your payment has been returned to your wallet.';
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
    where id = v_selected_user_id;

    update public.profiles
    set requests_completed = requests_completed + 1
    where id = v_requester_id;

    if v_selected_user_id is not null then
      perform public.release_provider(v_selected_user_id);
    end if;

    v_request_after := 'completed';
    v_payment_after := case
      when v_payment in ('locked', 'pending', 'disputed') then 'released'::public.payment_status
      else v_payment
    end;
    v_push_title := 'Payment released';
    v_push_body := 'Your payment has been released after the dispute was resolved.';
  else
    v_resolution := 'admin_resume_service';

    update public.requests
    set status = v_problem.status_before,
        completion_confirm_by = case
          when v_problem.status_before = 'completion_pending'::public.request_status
            then now() + public.completion_confirmation_interval()
          else null
        end
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
    v_push_body := 'The dispute was reviewed. You can continue with this request.';
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

  if v_selected_user_id is not null then
    perform public.send_push(
      array[v_selected_user_id],
      v_push_title,
      v_push_body,
      format('/engagement/%s', v_problem.request_id)
    );
  end if;
end;
$$;

