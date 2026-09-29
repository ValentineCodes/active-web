-- Responding (many pending offers) is separate from attending (one selected job).
-- Selection is concurrency-safe; responders stay visible on other pending responses.

create or replace function public.request_open_to_user(
  p_request_id uuid,
  p_user_id uuid,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_distance_m double precision;
  v_viewer extensions.geography;
begin
  if exists (
    select 1 from public.requests r
    where r.id = p_request_id and r.requester_id = p_user_id
  ) then
    return null;
  end if;

  if p_latitude is not null and p_longitude is not null then
    v_viewer := public.assert_coordinates(p_latitude, p_longitude);
  end if;

  select public.bucket_distance_m(extensions.ST_Distance(r.location, v_viewer))
  into v_distance_m
  from public.requests r
  where r.id = p_request_id
    and r.status = 'posted'
    and r.expires_at > now()
    and (
      v_viewer is null
      or extensions.ST_DWithin(r.location, v_viewer, public.discovery_radius_m())
    );

  return v_distance_m;
end;
$$;

create or replace function public.set_user_attendance(p_user_id uuid, p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.user_attendance
  set request_id = p_request_id
  where user_id = p_user_id
    and request_id is null;

  if not found then
    raise exception 'This person is currently attending to another request.' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.accept_response(p_response_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_request_id uuid;
  v_selected_user_id uuid;
  v_request_status public.request_status;
  v_response_status public.response_status;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_attending uuid;
  v_accepted uuid;
  v_locked_request_id uuid;
begin
  select rr.request_id
    into v_request_id
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  where rr.id = p_response_id
    and r.requester_id = v_user_id;

  if v_request_id is null then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  select r.status, r.payment_status, r.requester_id
    into v_request_status, v_payment, v_requester_id
  from public.requests r
  where r.id = v_request_id
  for update;

  if v_request_status <> 'posted' then
    raise exception 'this request is already %', v_request_status using errcode = '55000';
  end if;

  if exists (select 1 from public.handshakes h where h.request_id = v_request_id) then
    raise exception 'this request is already accepted' using errcode = '55000';
  end if;

  select rr.request_id, rr.responder_id, rr.status
    into v_locked_request_id, v_selected_user_id, v_response_status
  from public.request_responses rr
  where rr.id = p_response_id
  for update;

  if v_locked_request_id is distinct from v_request_id
     or v_response_status is distinct from 'pending' then
    raise exception 'this response is no longer pending' using errcode = '55000';
  end if;

  select ua.request_id into v_attending
  from public.user_attendance ua
  where ua.user_id = v_selected_user_id
  for update;

  if v_attending is not null then
    raise exception 'This person is currently attending to another request.' using errcode = '55000';
  end if;

  update public.request_responses
  set status = 'accepted', resolved_at = now()
  where id = p_response_id
    and status = 'pending'
  returning id into v_accepted;

  if v_accepted is null then
    raise exception 'this response is no longer pending' using errcode = '55000';
  end if;

  update public.request_responses
  set status = 'declined', resolved_at = now()
  where request_id = v_request_id
    and id <> p_response_id
    and status = 'pending';

  update public.requests
  set status = 'accepted',
      accepted_at = now(),
      accepted_response_id = p_response_id,
      selected_user_id = v_selected_user_id
  where id = v_request_id;

  insert into public.handshakes (request_id, response_id, requester_id, selected_user_id)
  values (v_request_id, p_response_id, v_requester_id, v_selected_user_id);

  if v_payment = 'locked' then
    perform public.apply_payment_transition(
      v_request_id,
      'pending',
      'handshake:' || v_request_id::text
    );
  end if;

  perform public.set_user_attendance(v_selected_user_id, v_request_id);

  return v_request_id;
end;
$$;

drop function if exists public.list_request_responses(uuid);

create function public.list_request_responses(p_request_id uuid)
returns table (
  response_id uuid,
  responder_id uuid,
  display_name text,
  avatar_path text,
  bio text,
  rating_average numeric,
  rating_count integer,
  jobs_completed integer,
  phone_verified boolean,
  message text,
  quoted_amount numeric,
  distance_m integer,
  status public.response_status,
  created_at timestamptz,
  expires_at timestamptz,
  responder_available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    rr.id,
    rr.responder_id,
    p.display_name,
    p.avatar_path,
    p.bio,
    p.rating_average,
    p.rating_count,
    p.jobs_completed,
    p.phone is not null as phone_verified,
    rr.message,
    rr.quoted_amount,
    rr.distance_m,
    rr.status,
    rr.created_at,
    rr.expires_at,
    (ua.request_id is null) as responder_available
  from public.requests r
  join public.request_responses rr on rr.request_id = r.id
  join public.profiles p on p.id = rr.responder_id
  left join public.user_attendance ua on ua.user_id = rr.responder_id
  where r.id = p_request_id
    and r.requester_id = public.assert_authenticated()
    and rr.status in ('pending', 'accepted')
  order by rr.created_at asc;
$$;

grant execute on function public.list_request_responses(uuid) to authenticated;
