-- A response only counts while that provider is still Active. Going offline removes
-- them from the requester's list. Accepting one who already left is refused in plain
-- language instead of tripping the availability check constraint.

create function public.count_available_responses(p_request_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.request_responses rr
  join public.provider_availability pa on pa.user_id = rr.provider_id
  join public.requests r on r.id = rr.request_id
  where rr.request_id = p_request_id
    and r.requester_id = (select auth.uid())
    and rr.status = 'pending'
    and pa.status = 'available'
    and pa.expires_at > now()
    and pa.location is not null;
$$;

revoke all on function public.count_available_responses(uuid) from public, anon;
grant execute on function public.count_available_responses(uuid) to authenticated;

create or replace view public.my_requests
with (security_invoker = on) as
select
  r.id as request_id,
  r.category_slug,
  r.description,
  r.category_data,
  r.scheduled_for,
  r.offered_amount,
  r.currency,
  r.payment_status,
  r.location_label,
  extensions.ST_Y(r.location::extensions.geometry) as latitude,
  extensions.ST_X(r.location::extensions.geometry) as longitude,
  r.search_radius_m,
  r.radius_expansions,
  case
    when r.status = 'searching' and r.expires_at <= now() then 'expired'::public.request_status
    else r.status
  end as status,
  r.provider_id,
  r.source_request_id,
  public.count_available_responses(r.id) as pending_response_count,
  exists (select 1 from public.ratings g where g.request_id = r.id) as is_rated,
  r.created_at,
  r.submitted_at,
  r.expires_at,
  r.accepted_at,
  r.started_at,
  r.completed_at,
  r.cancelled_at
from public.requests r
where r.requester_id = (select auth.uid());

create or replace function public.list_request_responses(p_request_id uuid)
returns table (
  response_id uuid,
  provider_id uuid,
  display_name text,
  avatar_path text,
  bio text,
  rating_average numeric,
  rating_count integer,
  jobs_completed integer,
  message text,
  quoted_amount numeric,
  eta_minutes integer,
  distance_m integer,
  status public.response_status,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    rr.id,
    rr.provider_id,
    p.display_name,
    p.avatar_path,
    p.bio,
    p.rating_average,
    p.rating_count,
    p.jobs_completed,
    rr.message,
    rr.quoted_amount,
    rr.eta_minutes,
    rr.distance_m,
    rr.status,
    rr.created_at
  from public.requests r
  join public.request_responses rr on rr.request_id = r.id
  join public.profiles p on p.id = rr.provider_id
  left join public.provider_availability pa on pa.user_id = rr.provider_id
  where r.id = p_request_id
    and r.requester_id = public.assert_authenticated()
    and (
      rr.status = 'accepted'
      or (
        rr.status = 'pending'
        and pa.status = 'available'
        and pa.expires_at > now()
        and pa.location is not null
      )
    )
  order by rr.created_at asc;
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
  v_provider_id uuid;
  v_request_status public.request_status;
  v_response_status public.response_status;
  v_requester_id uuid;
  v_payment public.payment_status;
begin
  select rr.request_id, rr.provider_id, rr.status, r.requester_id
    into v_request_id, v_provider_id, v_response_status, v_requester_id
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  where rr.id = p_response_id
    and r.requester_id = v_user_id;

  if v_request_id is null then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  select status, payment_status into v_request_status, v_payment
  from public.requests
  where id = v_request_id
  for update;

  if v_request_status <> 'searching' then
    raise exception 'this request is already %', v_request_status using errcode = '55000';
  end if;

  if v_response_status <> 'pending' then
    raise exception 'this response is no longer pending' using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.provider_availability pa
    where pa.user_id = v_provider_id
      and pa.status = 'available'
      and pa.expires_at > now()
      and pa.location is not null
  ) then
    raise exception 'This person is no longer available.' using errcode = '55000';
  end if;

  update public.request_responses
  set status = 'accepted', resolved_at = now()
  where id = p_response_id;

  update public.request_responses
  set status = 'declined', resolved_at = now()
  where request_id = v_request_id
    and id <> p_response_id
    and status = 'pending';

  update public.requests
  set status = 'accepted',
      accepted_at = now(),
      accepted_response_id = p_response_id,
      provider_id = v_provider_id
  where id = v_request_id;

  insert into public.handshakes (request_id, response_id, requester_id, provider_id)
  values (v_request_id, p_response_id, v_requester_id, v_provider_id);

  if v_payment = 'locked' then
    perform public.apply_payment_transition(
      v_request_id,
      'pending',
      'handshake:' || v_request_id::text
    );
  end if;

  update public.provider_availability
  set status = 'busy'
  where user_id = v_provider_id;

  return v_request_id;
end;
$$;
