-- A response is checked against where the provider is now, not where they went Active.
-- Public browse uses the phone's current position. Matching uses the stored one.
-- Those two drifted, so a request still on screen was rejected as unavailable.

drop function public.respond_to_request(uuid, text, numeric, integer);

create function public.respond_to_request(
  p_request_id uuid,
  p_message text default null,
  p_quoted_amount numeric default null,
  p_eta_minutes integer default null,
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
  v_distance_m double precision;
  v_response_id uuid;
  v_request_expires_at timestamptz;
begin
  if p_latitude is not null and p_longitude is not null then
    update public.provider_availability
    set location = public.assert_coordinates(p_latitude, p_longitude)
    where user_id = v_user_id
      and status = 'available'
      and expires_at > now();
  end if;

  select m.distance_m into v_distance_m
  from public.matches(p_request_id, v_user_id) m;

  if v_distance_m is null then
    raise exception 'this request is no longer available to you' using errcode = '55000';
  end if;

  select r.expires_at into v_request_expires_at
  from public.requests r
  where r.id = p_request_id;

  insert into public.request_responses (
    request_id,
    provider_id,
    message,
    quoted_amount,
    eta_minutes,
    distance_m,
    expires_at
  )
  values (
    p_request_id,
    v_user_id,
    nullif(btrim(p_message), ''),
    p_quoted_amount,
    p_eta_minutes,
    public.bucket_distance_m(v_distance_m),
    v_request_expires_at
  )
  returning id into v_response_id;

  return v_response_id;
end;
$$;

revoke execute on function public.respond_to_request(uuid, text, numeric, integer, double precision, double precision) from public, anon;
grant execute on function public.respond_to_request(uuid, text, numeric, integer, double precision, double precision) to authenticated;
