-- Notification triggers still referenced provider_id / eta after the domain rename.

create or replace function public.notify_requester_of_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_id uuid;
  v_responder_name text;
begin
  select r.requester_id into v_requester_id
  from public.requests r
  where r.id = new.request_id;

  select p.display_name into v_responder_name
  from public.profiles p
  where p.id = new.responder_id;

  perform public.send_push(
    array[v_requester_id],
    'Someone can help',
    format('%s responded to your request', v_responder_name),
    format('/request/%s', new.request_id)
  );

  return new;
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
begin
  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = new.requester_id;

  perform public.send_push(
    array[new.selected_user_id],
    'You''ve been selected!',
    format('%s chose you. Open the job for their exact location and phone number.', v_requester_name),
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
  v_body text;
begin
  if new.status <> 'accepted'::public.request_status
     or old.status = new.status then
    return new;
  end if;

  select p.display_name into v_selected_name
  from public.profiles p
  where p.id = new.selected_user_id;

  v_body := format(
    '%s is helping you. Open the job for their contact details and your exact location.',
    coalesce(v_selected_name, 'Your helper')
  );

  perform public.send_push(
    array[new.requester_id],
    'Helper selected',
    v_body,
    format('/engagement/%s', new.id)
  );

  return new;
end;
$$;
