-- Push notifications.
--
-- Providers cannot read public.requests before acceptance, so they have no Realtime
-- stream to watch and a notification is how they learn a request exists at all. The
-- dispatch lives in the database for the same reason matching does: it must use the
-- authoritative eligibility rule, and it must run inside the transaction that created
-- the row.
--
-- Expo's push service is called directly. There is no relay to deploy and no secret to
-- store, because the device token is the only credential involved.

create extension if not exists pg_net;

create function public.send_push(
  p_user_ids uuid[],
  p_title text,
  p_body text,
  p_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages jsonb;
begin
  if coalesce(array_length(p_user_ids, 1), 0) = 0 then
    return;
  end if;

  -- Expo accepts up to 100 messages per call. Beyond that this needs chunking, which
  -- the MVP's volumes do not reach.
  select jsonb_agg(
           jsonb_build_object(
             'to', t.token,
             'title', p_title,
             'body', p_body,
             'sound', 'default',
             'data', jsonb_build_object('url', p_url)
           )
         )
    into v_messages
  from public.push_tokens t
  where t.user_id = any (p_user_ids);

  -- Nobody involved has registered a device. Normal, not an error.
  if v_messages is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_messages
  );
end;
$$;

-- A new request reaches exactly the providers public.matches says are eligible.
create function public.notify_matching_providers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_ids uuid[];
  v_label text;
begin
  if new.status <> 'searching' then
    return new;
  end if;

  select array_agg(distinct m.provider_id)
    into v_provider_ids
  from public.matches(new.id) m;

  select c.label into v_label
  from public.service_categories c
  where c.slug = new.category_slug;

  perform public.send_push(
    v_provider_ids,
    format('%s needed near you', v_label),
    format('%s · %s', new.location_label, left(new.description, 80)),
    '/activity'
  );

  return new;
end;
$$;

create trigger requests_notify_providers
  after insert on public.requests
  for each row execute function public.notify_matching_providers();

create function public.notify_requester_of_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_id uuid;
  v_provider_name text;
begin
  select r.requester_id into v_requester_id
  from public.requests r
  where r.id = new.request_id;

  select p.display_name into v_provider_name
  from public.profiles p
  where p.id = new.provider_id;

  perform public.send_push(
    array[v_requester_id],
    'Someone can help',
    format('%s responded to your request', v_provider_name),
    format('/request/%s', new.request_id)
  );

  return new;
end;
$$;

create trigger request_responses_notify_requester
  after insert on public.request_responses
  for each row execute function public.notify_requester_of_response();

-- Acceptance is the moment the provider gains the exact location and contact details, so
-- it is the one they most need to be told about.
create function public.notify_provider_of_acceptance()
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
    array[new.provider_id],
    'You were chosen',
    format('%s accepted your response. Their location and number are now available.', v_requester_name),
    format('/engagement/%s', new.id)
  );

  return new;
end;
$$;

create trigger requests_notify_acceptance
  after update of status on public.requests
  for each row
  when (old.status = 'searching' and new.status = 'accepted')
  execute function public.notify_provider_of_acceptance();

revoke execute on function public.send_push(uuid[], text, text, text) from public, anon, authenticated;
