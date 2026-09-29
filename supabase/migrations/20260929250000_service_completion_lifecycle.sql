-- Post-selection lifecycle: accepted → in_progress → completion_pending → completed.
-- Selected user marks complete; requester confirms (or auto-complete after the window).

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

  perform public.send_push(
    array[v_requester_id],
    'In progress',
    format('%s has started helping you.', coalesce(v_helper_name, 'Your helper')),
    format('/engagement/%s', p_request_id)
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
  where id = p_request_id and selected_user_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status in ('completion_pending', 'completed') then
    return;
  end if;

  if v_status not in ('accepted', 'in_progress') then
    raise exception 'only an active job can be marked complete' using errcode = '55000';
  end if;

  update public.requests
  set status = 'completion_pending'::public.request_status,
      completion_confirm_by = now() + public.completion_confirmation_interval()
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'completion_pending'::public.request_status,
    'mark_complete:' || p_request_id::text
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

    perform public.send_push(
      array[v_selected_user_id],
      'Payment released',
      format(
        '%s confirmed the request is complete. Your payment was released to your wallet.',
        coalesce(v_requester_name, 'The requester')
      ),
      format('/engagement/%s', p_request_id)
    );
  end if;

  return true;
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
  v_payment public.payment_status;
begin
  select status, payment_status
    into v_status, v_payment
  from public.requests
  where id = p_request_id and requester_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'completed' then
    return;
  end if;

  if v_payment = 'disputed' then
    raise exception 'disputed funds cannot be released through completion'
      using errcode = '55000';
  end if;

  if v_status <> 'completion_pending' then
    raise exception 'you can confirm completion only after your helper marks the request complete'
      using errcode = '55000';
  end if;

  if not public.finalize_request_completion(
    p_request_id,
    v_user_id,
    'confirm_complete:' || p_request_id::text
  ) then
    raise exception 'disputed funds cannot be released through completion'
      using errcode = '55000';
  end if;
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

  perform public.send_push(
    array[v_requester_id],
    'Request completed',
    'The confirmation window ended, so this request was completed automatically. You can still leave a rating.',
    format('/rate/%s', p_request_id)
  );

  if v_selected_user_id is not null then
    perform public.send_push(
      array[v_selected_user_id],
      'Payment released',
      format(
        '%s did not confirm in time. The request was completed automatically and your payment was released.',
        coalesce(v_requester_name, 'The requester')
      ),
      format('/engagement/%s', p_request_id)
    );
  end if;

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
      and r.payment_status <> 'disputed'::public.payment_status
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

create or replace function public.notify_requester_of_completion_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_helper_name text;
begin
  if new.status <> 'completion_pending'::public.request_status
     or old.status = new.status then
    return new;
  end if;

  select p.display_name into v_helper_name
  from public.profiles p
  where p.id = new.selected_user_id;

  perform public.send_push(
    array[new.requester_id],
    'Confirm completion',
    format('%s says the request is complete. Confirm or report a problem.', v_helper_name),
    format('/engagement/%s', new.id)
  );

  return new;
end;
$$;

revoke all on function public.finalize_request_completion(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.auto_complete_request(uuid) from public, anon, authenticated;
revoke all on function public.auto_complete_due_requests(integer) from public, anon, authenticated;

revoke execute on function public.start_request(uuid) from public, anon;
grant execute on function public.start_request(uuid) to authenticated;

revoke execute on function public.mark_service_complete(uuid) from public, anon;
grant execute on function public.mark_service_complete(uuid) to authenticated;

revoke execute on function public.complete_request(uuid) from public, anon;
grant execute on function public.complete_request(uuid) to authenticated;
