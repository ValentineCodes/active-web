-- Commitment is separate from responding.
--
-- A provider may answer many searching requests while Active. Those answers do not
-- reserve them. The provider becomes committed only when a requester selects one
-- response and this function creates the handshake, in the same transaction.
--
-- That transition locks the provider row, so two requesters cannot commit the same
-- provider to two open requests. Other pending answers are left as they are: they
-- stay on record, and they cannot be selected until the provider is available again.
-- Categories, radius, and location stay on the availability row so the service state
-- remains explicit while status is busy.

alter table public.provider_availability
  add column committed_request_id uuid references public.requests (id);

update public.provider_availability pa
set committed_request_id = open_request.id
from (
  select distinct on (r.provider_id) r.provider_id, r.id
  from public.requests r
  where r.provider_id is not null
    and r.status in ('accepted', 'in_progress', 'completion_pending', 'disputed')
  order by r.provider_id, r.accepted_at desc nulls last
) as open_request
where pa.user_id = open_request.provider_id
  and pa.status = 'busy';

update public.provider_availability
set status = case
               when expires_at > now() then 'available'::public.availability_status
               else 'offline'::public.availability_status
             end,
    location = case when expires_at > now() then location else null end,
    went_active_at = case when expires_at > now() then went_active_at else null end,
    expires_at = case when expires_at > now() then expires_at else null end
where status = 'busy'
  and committed_request_id is null;

alter table public.provider_availability
  add constraint provider_availability_commitment_is_explicit check (
    (status = 'busy') = (committed_request_id is not null)
  );

create unique index requests_one_open_provider_commitment
  on public.requests (provider_id)
  where provider_id is not null
    and status in ('accepted', 'in_progress', 'completion_pending', 'disputed');

create or replace view public.my_availability
with (security_invoker = on) as
select
  pa.user_id,
  case
    when pa.status <> 'offline' and pa.expires_at <= now() then 'offline'::public.availability_status
    else pa.status
  end as status,
  pa.service_radius_m,
  pa.went_active_at,
  pa.expires_at,
  pa.updated_at,
  coalesce(
    array(
      select ps.category_slug
      from public.provider_services ps
      where ps.user_id = pa.user_id
      order by ps.category_slug
    ),
    '{}'::text[]
  ) as category_slugs,
  pa.committed_request_id
from public.provider_availability pa;

-- Eligibility for a new answer. Commitment uses the same predicate, then locks.
create or replace function public.matches(
  p_request_id uuid default null,
  p_provider_id uuid default null
)
returns table (request_id uuid, provider_id uuid, distance_m double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
         pa.user_id,
         extensions.ST_Distance(r.location, pa.location)
  from public.provider_availability pa
  join public.profiles provider on provider.id = pa.user_id
  join public.provider_services ps on ps.user_id = pa.user_id
  join public.requests r on r.category_slug = ps.category_slug
  where (p_provider_id is null or pa.user_id = p_provider_id)
    and (p_request_id is null or r.id = p_request_id)
    and pa.status = 'available'
    and pa.committed_request_id is null
    and pa.expires_at > now()
    and pa.location is not null
    and provider.avatar_path is not null
    and provider.avatar_captured_in_app
    and r.status = 'searching'
    and r.expires_at > now()
    and r.requester_id <> pa.user_id
    and extensions.ST_DWithin(
          r.location,
          pa.location,
          least(r.search_radius_m, pa.service_radius_m)
        );
$$;

create or replace function public.release_provider(p_provider_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.provider_availability
  set status = case
                 when expires_at > now() then 'available'::public.availability_status
                 else 'offline'::public.availability_status
               end,
      committed_request_id = null,
      location = case when expires_at > now() then location else null end,
      went_active_at = case when expires_at > now() then went_active_at else null end,
      expires_at = case when expires_at > now() then expires_at else null end
  where user_id = p_provider_id
    and status = 'busy';
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
  v_requester_id uuid;
  v_payment public.payment_status;
  v_provider_status public.availability_status;
  v_provider_expires_at timestamptz;
  v_provider_has_location boolean;
  v_accepted uuid;
begin
  select rr.request_id, rr.provider_id
    into v_request_id, v_provider_id
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  where rr.id = p_response_id
    and r.requester_id = v_user_id;

  if v_request_id is null then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  select status, payment_status, requester_id
    into v_request_status, v_payment, v_requester_id
  from public.requests
  where id = v_request_id
  for update;

  if v_request_status <> 'searching' then
    raise exception 'this request is already %', v_request_status using errcode = '55000';
  end if;

  -- Serializes every commitment of this provider. The second requester waits, then
  -- sees busy and stops. The client is not part of this decision.
  select pa.status, pa.expires_at, pa.location is not null
    into v_provider_status, v_provider_expires_at, v_provider_has_location
  from public.provider_availability pa
  where pa.user_id = v_provider_id
  for update;

  if v_provider_status is distinct from 'available'
    or v_provider_expires_at is null
    or v_provider_expires_at <= now()
    or not v_provider_has_location
    or not exists (
      select 1 from public.profiles provider
      where provider.id = v_provider_id
        and provider.avatar_path is not null
        and provider.avatar_captured_in_app
    )
  then
    raise exception 'This person is no longer available.' using errcode = '55000';
  end if;

  update public.request_responses
  set status = 'accepted', resolved_at = now()
  where id = p_response_id
    and status = 'pending'
  returning id into v_accepted;

  if v_accepted is null then
    raise exception 'this response is no longer pending' using errcode = '55000';
  end if;

  -- Other answers on this request are turned down. Answers this provider already
  -- sent to other requests stay pending.
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
  set status = 'busy',
      committed_request_id = v_request_id
  where user_id = v_provider_id
    and status = 'available'
    and committed_request_id is null;

  if not found then
    raise exception 'This person is no longer available.' using errcode = '55000';
  end if;

  return v_request_id;
end;
$$;
