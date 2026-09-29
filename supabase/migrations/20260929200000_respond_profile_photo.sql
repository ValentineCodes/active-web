-- Responders need an in-app profile photo before a response is stored.

create or replace function public.respond_to_request(
  p_request_id uuid,
  p_message text default null,
  p_quoted_amount numeric default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_onboarded();
  v_distance_m integer;
  v_response_id uuid;
  v_request_expires_at timestamptz;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.avatar_path is not null
      and p.avatar_captured_in_app
  ) then
    raise exception 'add a profile photo in the app before responding' using errcode = '55000';
  end if;

  v_distance_m := public.request_open_to_user(
    p_request_id,
    v_user_id,
    p_latitude,
    p_longitude
  );

  if v_distance_m is null then
    raise exception 'this request is no longer available to you' using errcode = '55000';
  end if;

  select r.expires_at into v_request_expires_at
  from public.requests r
  where r.id = p_request_id;

  insert into public.request_responses (
    request_id,
    responder_id,
    message,
    quoted_amount,
    distance_m,
    expires_at
  )
  values (
    p_request_id,
    v_user_id,
    nullif(btrim(p_message), ''),
    p_quoted_amount,
    v_distance_m,
    v_request_expires_at
  )
  on conflict (request_id, responder_id) do update
  set message = excluded.message,
      quoted_amount = excluded.quoted_amount,
      distance_m = excluded.distance_m,
      expires_at = excluded.expires_at
  where public.request_responses.status = 'pending'
  returning id into v_response_id;

  if v_response_id is null then
    raise exception 'you already have a response on this request' using errcode = '55000';
  end if;

  return v_response_id;
end;
$$;
