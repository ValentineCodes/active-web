-- Privacy and authorization tightening.
--
-- Discovery keeps a coarse area label and bucketed distance. Street-level fields in
-- category data stay off those reads until a handshake exists.
-- Request, catalogue, and avatar bytes are no longer readable by every signed-in user.
-- Provider GPS is shared only while that provider is still committed to the request.
-- A handshake cannot be opened after expiry, and disputed escrow cannot move through
-- ordinary completion.

create function public.redact_discovery_category_data(p_data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_data, '{}'::jsonb) - 'pickup' - 'destination' - 'drop_off';
$$;

revoke all on function public.redact_discovery_category_data(jsonb)
  from public, anon, authenticated;

create function public.request_has_media_path(p_category_data jsonb, p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_category_data -> 'photo_paths') = 'array'
    and exists (
      select 1
      from jsonb_array_elements_text(p_category_data -> 'photo_paths') as photo(path)
      where photo.path = p_name
    );
$$;

revoke all on function public.request_has_media_path(jsonb, text)
  from public, anon, authenticated;

-- Pre-handshake reads ---------------------------------------------------------------

create or replace function public.browse_nearby_requests(
  p_latitude double precision,
  p_longitude double precision,
  p_category_slug text default null
)
returns table (
  request_id uuid,
  category_slug text,
  description text,
  category_data jsonb,
  scheduled_for timestamptz,
  offered_amount numeric,
  currency text,
  location_label text,
  distance_m integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select
      public.assert_onboarded() as user_id,
      public.assert_coordinates(p_latitude, p_longitude) as location,
      nullif(btrim(p_category_slug), '') as category_slug
  )
  select
    r.id,
    r.category_slug,
    r.description,
    public.redact_discovery_category_data(r.category_data),
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(extensions.ST_Distance(r.location, viewer.location))
  from viewer
  join public.requests r
    on r.status = 'searching'
   and r.expires_at > now()
   and r.requester_id <> viewer.user_id
   and (viewer.category_slug is null or r.category_slug = viewer.category_slug)
   and extensions.ST_DWithin(r.location, viewer.location, r.search_radius_m)
   and not exists (
     select 1 from public.request_responses rr
     where rr.request_id = r.id
       and rr.provider_id = viewer.user_id
       and rr.status = 'declined'
   )
  order by extensions.ST_Distance(r.location, viewer.location) asc, r.created_at desc
  limit 40;
$$;

create or replace function public.browse_request(
  p_request_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  request_id uuid,
  category_slug text,
  description text,
  category_data jsonb,
  scheduled_for timestamptz,
  offered_amount numeric,
  currency text,
  location_label text,
  distance_m integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select
      public.assert_onboarded() as user_id,
      public.assert_coordinates(p_latitude, p_longitude) as location
  )
  select
    r.id,
    r.category_slug,
    r.description,
    public.redact_discovery_category_data(r.category_data),
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(extensions.ST_Distance(r.location, viewer.location))
  from viewer
  join public.requests r
    on r.id = p_request_id
   and r.status = 'searching'
   and r.expires_at > now()
   and r.requester_id <> viewer.user_id
   and extensions.ST_DWithin(r.location, viewer.location, r.search_radius_m)
   and not exists (
     select 1 from public.request_responses rr
     where rr.request_id = r.id
       and rr.provider_id = viewer.user_id
       and rr.status = 'declined'
   );
$$;

create or replace function public.nearby_requests()
returns table (
  request_id uuid,
  category_slug text,
  description text,
  category_data jsonb,
  scheduled_for timestamptz,
  offered_amount numeric,
  currency text,
  location_label text,
  distance_m integer,
  created_at timestamptz,
  expires_at timestamptz,
  requester_display_name text,
  requester_avatar_path text,
  requester_rating_average numeric,
  requester_rating_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.assert_onboarded() as user_id)
  select
    r.id,
    r.category_slug,
    r.description,
    public.redact_discovery_category_data(r.category_data),
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(m.distance_m),
    r.created_at,
    r.expires_at,
    p.display_name,
    p.avatar_path,
    p.rating_average,
    p.rating_count
  from me
  cross join lateral public.matches(null, me.user_id) m
  join public.requests r on r.id = m.request_id
  join public.profiles p on p.id = r.requester_id
  where not exists (
    select 1 from public.request_responses rr
    where rr.request_id = r.id
      and rr.provider_id = me.user_id
      and rr.status not in ('withdrawn', 'expired')
  )
  order by m.distance_m asc, r.created_at desc;
$$;

create or replace function public.my_responses()
returns table (
  response_id uuid,
  request_id uuid,
  category_slug text,
  description text,
  category_data jsonb,
  location_label text,
  distance_m integer,
  scheduled_for timestamptz,
  offered_amount numeric,
  quoted_amount numeric,
  currency text,
  message text,
  eta_minutes integer,
  response_status public.response_status,
  request_status public.request_status,
  requester_display_name text,
  requester_avatar_path text,
  created_at timestamptz,
  decline_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.assert_authenticated() as user_id)
  select
    rr.id,
    r.id,
    r.category_slug,
    r.description,
    case
      when r.provider_id = me.user_id
        or exists (
          select 1 from public.handshakes h
          where h.request_id = r.id
            and h.provider_id = me.user_id
        )
      then r.category_data
      else public.redact_discovery_category_data(r.category_data)
    end,
    r.location_label,
    rr.distance_m,
    r.scheduled_for,
    r.offered_amount,
    rr.quoted_amount,
    r.currency,
    rr.message,
    rr.eta_minutes,
    rr.status,
    r.status,
    p.display_name,
    p.avatar_path,
    rr.created_at,
    rr.decline_reason
  from me
  join public.request_responses rr on rr.provider_id = me.user_id
  join public.requests r on r.id = rr.request_id
  join public.profiles p on p.id = r.requester_id
  order by rr.created_at desc;
$$;

-- Engagement: live provider coordinates only while they are committed to this job.

create or replace function public.get_engagement(p_request_id uuid)
returns table (
  request_id uuid,
  category_slug text,
  description text,
  category_data jsonb,
  scheduled_for timestamptz,
  offered_amount numeric,
  quoted_amount numeric,
  currency text,
  request_status public.request_status,
  payment_status public.payment_status,
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  completion_confirm_by timestamptz,
  service_problem_kind public.service_problem_kind,
  service_problem_respond_by timestamptz,
  service_problem_reported_by_me boolean,
  service_problem_description text,
  viewer_is_requester boolean,
  location_label text,
  request_latitude double precision,
  request_longitude double precision,
  provider_latitude double precision,
  provider_longitude double precision,
  counterparty_id uuid,
  counterparty_display_name text,
  counterparty_avatar_path text,
  counterparty_phone text,
  counterparty_rating_average numeric,
  counterparty_rating_count integer,
  rating_stars smallint,
  handshake_id uuid,
  handshake_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.assert_authenticated() as user_id)
  select
    r.id,
    r.category_slug,
    r.description,
    r.category_data,
    r.scheduled_for,
    r.offered_amount,
    accepted.quoted_amount,
    r.currency,
    r.status,
    r.payment_status,
    r.accepted_at,
    r.started_at,
    r.completed_at,
    r.completion_confirm_by,
    sp.kind,
    sp.respond_by,
    sp.reported_by = me.user_id,
    sp.description,
    r.requester_id = me.user_id,
    r.location_label,
    extensions.ST_Y(r.location::extensions.geometry),
    extensions.ST_X(r.location::extensions.geometry),
    extensions.ST_Y(pa.location::extensions.geometry),
    extensions.ST_X(pa.location::extensions.geometry),
    counterparty.id,
    counterparty.display_name,
    counterparty.avatar_path,
    counterparty.phone,
    counterparty.rating_average,
    counterparty.rating_count,
    rating.stars,
    h.id,
    h.created_at
  from me
  join public.requests r
    on r.id = p_request_id
   and r.status in (
     'accepted',
     'in_progress',
     'completion_pending',
     'completed',
     'disputed',
     'no_show'
   )
   and me.user_id in (r.requester_id, r.provider_id)
  join public.profiles counterparty
    on counterparty.id = case when r.requester_id = me.user_id then r.provider_id else r.requester_id end
  left join public.request_responses accepted on accepted.id = r.accepted_response_id
  left join public.provider_availability pa
    on pa.user_id = r.provider_id
   and pa.committed_request_id = r.id
   and r.requester_id = me.user_id
   and r.status in ('accepted', 'in_progress', 'completion_pending', 'disputed')
  left join public.service_problems sp
    on sp.request_id = r.id
   and sp.status = 'open'
  left join public.ratings rating on rating.request_id = r.id
  left join public.handshakes h on h.request_id = r.id;
$$;

-- Selection locks the request, then the response, then the provider. A handshake
-- that wins the race with the expiry job is kept; expire_request will not undo it.

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
  v_provider_status public.availability_status;
  v_provider_expires_at timestamptz;
  v_provider_has_location boolean;
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

  if v_request_status <> 'searching' then
    raise exception 'this request is already %', v_request_status using errcode = '55000';
  end if;

  if exists (select 1 from public.handshakes h where h.request_id = v_request_id) then
    raise exception 'this request is already accepted' using errcode = '55000';
  end if;

  select rr.request_id, rr.provider_id, rr.status
    into v_locked_request_id, v_provider_id, v_response_status
  from public.request_responses rr
  where rr.id = p_response_id
  for update;

  if v_locked_request_id is distinct from v_request_id
     or v_response_status is distinct from 'pending' then
    raise exception 'this response is no longer pending' using errcode = '55000';
  end if;

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

-- Completion must not pay out escrow that is under dispute.

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
  v_provider_id uuid;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_requester_name text;
begin
  if p_status_event_key is null or btrim(p_status_event_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  select r.status, r.provider_id, r.requester_id, r.payment_status
    into v_status, v_provider_id, v_requester_id, v_payment
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
  set status = 'completed',
      completed_at = now(),
      started_at = coalesce(started_at, now())
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_status,
    'completed',
    p_status_event_key
  );

  if v_payment = 'pending' then
    perform public.apply_payment_transition(
      p_request_id,
      'released',
      'complete:' || p_request_id::text
    );
  end if;

  update public.profiles
  set jobs_completed = jobs_completed + 1
  where id = v_provider_id;

  update public.profiles
  set requests_completed = requests_completed + 1
  where id = v_requester_id;

  perform public.release_provider(v_provider_id);

  if p_status_event_key like 'confirm_complete:%' then
    select p.display_name into v_requester_name
    from public.profiles p
    where p.id = v_requester_id;

    perform public.send_push(
      array[v_provider_id],
      'Payment released',
      format(
        '%s confirmed the job is done. Your payment was released to your wallet.',
        coalesce(v_requester_name, 'The client')
      ),
      format('/engagement/%s', p_request_id)
    );
  end if;

  return true;
end;
$$;

revoke all on function public.finalize_request_completion(uuid, uuid, text)
  from public, anon, authenticated;

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
  select status, payment_status into v_status, v_payment
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
    raise exception 'you can confirm completion only after your provider marks the service complete'
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
  v_provider_id uuid;
  v_confirm_by timestamptz;
  v_payment public.payment_status;
  v_provider_name text;
  v_requester_name text;
  v_finalized boolean;
begin
  select r.status, r.requester_id, r.provider_id, r.completion_confirm_by, r.payment_status
    into v_status, v_requester_id, v_provider_id, v_confirm_by, v_payment
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

  select p.display_name into v_provider_name
  from public.profiles p
  where p.id = v_provider_id;

  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = v_requester_id;

  perform public.send_push(
    array[v_requester_id],
    'Job marked complete',
    format(
      '%s did not respond in time, so this job was completed automatically. You can still leave a rating.',
      v_provider_name
    ),
    format('/rate/%s', p_request_id)
  );

  perform public.send_push(
    array[v_provider_id],
    'Payment released',
    format(
      '%s did not confirm in time. The job was completed automatically and your payment was released.',
      v_requester_name
    ),
    format('/engagement/%s', p_request_id)
  );

  return true;
end;
$$;

revoke all on function public.auto_complete_request(uuid) from public, anon, authenticated;

-- Returning from a dispute restarts the confirmation window instead of leaving
-- escrow waiting with no deadline.

create or replace function public.contest_service_problem(p_request_id uuid)
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
  v_problem public.service_problems%rowtype;
begin
  select r.requester_id, r.provider_id, r.status
    into v_requester_id, v_provider_id, v_status
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_requester_id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_user_id not in (v_requester_id, v_provider_id) then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status <> 'disputed' then
    raise exception 'there is no open problem on this request' using errcode = '55000';
  end if;

  select *
    into v_problem
  from public.service_problems sp
  where sp.request_id = p_request_id
    and sp.status = 'open'
  for update;

  if not found then
    raise exception 'there is no open problem on this request' using errcode = '55000';
  end if;

  if v_problem.reported_by = v_user_id then
    raise exception 'you cannot respond to your own report' using errcode = '55000';
  end if;

  if v_problem.respond_by is not null and v_problem.respond_by <= now() then
    raise exception 'the response window has closed' using errcode = '55000';
  end if;

  update public.service_problems
  set status = 'resolved',
      resolution = 'contested',
      resolved_at = now()
  where id = v_problem.id;

  update public.requests
  set status = v_problem.status_before,
      completion_confirm_by = case
        when v_problem.status_before = 'completion_pending'::public.request_status
          then now() + public.completion_confirmation_interval()
        else null
      end
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_user_id,
    'disputed',
    v_problem.status_before,
    'contest_problem:' || p_request_id::text
  );

  if v_problem.payment_before in ('locked', 'pending')
     and exists (
       select 1
       from public.requests r
       where r.id = p_request_id
         and r.payment_status = 'disputed'
     ) then
    perform public.apply_payment_transition(
      p_request_id,
      v_problem.payment_before,
      'contest_problem:' || p_request_id::text
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
  v_provider_id uuid;
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

  select r.status, r.payment_status, r.provider_id, r.requester_id
    into v_status, v_payment, v_provider_id, v_requester_id
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
        provider_id = null,
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

    if v_provider_id is not null then
      perform public.release_provider(v_provider_id);
    end if;

    v_request_after := 'cancelled';
    v_payment_after := case
      when v_payment in ('locked', 'pending', 'disputed') then 'refunded'::public.payment_status
      else v_payment
    end;
    v_push_title := 'Dispute resolved';
    v_push_body := 'Support resolved the dispute in your favor. Any secured payment was refunded.';
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
    where id = v_provider_id;

    update public.profiles
    set requests_completed = requests_completed + 1
    where id = v_requester_id;

    if v_provider_id is not null then
      perform public.release_provider(v_provider_id);
    end if;

    v_request_after := 'completed';
    v_payment_after := case
      when v_payment in ('locked', 'pending', 'disputed') then 'released'::public.payment_status
      else v_payment
    end;
    v_push_title := 'Dispute resolved';
    v_push_body := 'Support resolved the dispute. Payment was released to the provider.';
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
    v_push_body := 'Support resolved the dispute. The job can continue.';
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

  if v_provider_id is not null then
    perform public.send_push(
      array[v_provider_id],
      v_push_title,
      v_push_body,
      format('/engagement/%s', v_problem.request_id)
    );
  end if;
end;
$$;

revoke all on function public.admin_resolve_service_problem(uuid, text, text, text)
  from public, anon, authenticated;

-- Security-definer functions run as their owner, so current_user is not the invoker.
-- session_user stays the login role. PostgREST keeps that as authenticator and puts
-- the API role in the JWT.

create or replace function public.assert_admin_caller()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user in ('postgres', 'supabase_admin', 'service_role') then
    return;
  end if;

  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return;
  end if;

  raise exception 'not authorized' using errcode = '42501';
end;
$$;

revoke all on function public.assert_admin_caller() from public, anon, authenticated;

create or replace function public.wallet_record_deposit(
  p_user_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_external_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user not in ('postgres', 'supabase_admin', 'service_role')
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'deposit amount must be positive' using errcode = '22023';
  end if;

  perform public.post_wallet_ledger(
    p_idempotency_key,
    p_user_id,
    null,
    'external_deposit',
    p_amount,
    0,
    0,
    0,
    p_external_reference
  );
end;
$$;

revoke all on function public.wallet_record_deposit(uuid, numeric, text, text)
  from public, anon, authenticated;

revoke all on function public.apply_payment_transition(uuid, public.payment_status, text)
  from public, anon, authenticated;
revoke all on function public.post_wallet_ledger(
  text, uuid, uuid, text, numeric, numeric, numeric, numeric, text
) from public, anon, authenticated;
revoke all on function public.matches(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_provider(uuid) from public, anon, authenticated;
revoke all on function public.expire_request(uuid) from public, anon, authenticated;
revoke all on function public.expire_due_requests(integer) from public, anon, authenticated;

-- Media ----------------------------------------------------------------------------

create table public.request_media_read_grants (
  user_id uuid not null references public.profiles (id) on delete cascade,
  object_name text not null,
  expires_at timestamptz not null,
  primary key (user_id, object_name)
);

alter table public.request_media_read_grants enable row level security;

revoke all on public.request_media_read_grants from public, anon, authenticated;

create function public.request_media_visible_to_party(p_user_id uuid, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.requests r
    where public.request_has_media_path(r.category_data, p_name)
      and (
        r.requester_id = p_user_id
        or r.provider_id = p_user_id
        or exists (
          select 1 from public.handshakes h
          where h.request_id = r.id
            and p_user_id in (h.requester_id, h.provider_id)
        )
      )
  )
  or exists (
    select 1
    from public.service_problems sp
    join public.requests r on r.id = sp.request_id
    where p_name = any (sp.evidence_paths)
      and (
        r.requester_id = p_user_id
        or r.provider_id = p_user_id
        or exists (
          select 1 from public.handshakes h
          where h.request_id = r.id
            and p_user_id in (h.requester_id, h.provider_id)
        )
      )
  );
$$;

revoke all on function public.request_media_visible_to_party(uuid, text)
  from public, anon, authenticated;

create function public.can_read_request_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (storage.foldername(p_name))[1] = (select auth.uid())::text
    or public.request_media_visible_to_party((select auth.uid()), p_name)
    or exists (
      select 1
      from public.request_media_read_grants g
      join public.requests r
        on public.request_has_media_path(r.category_data, g.object_name)
      where g.user_id = (select auth.uid())
        and g.object_name = p_name
        and g.expires_at > now()
        and r.status = 'searching'
        and r.expires_at > now()
        and r.requester_id <> (select auth.uid())
    );
$$;

revoke all on function public.can_read_request_media(text) from public, anon;
grant execute on function public.can_read_request_media(text) to authenticated;

create function public.authorize_request_media_read(
  p_path text,
  p_latitude double precision,
  p_longitude double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_location extensions.geography;
begin
  if p_path is null or btrim(p_path) = '' then
    raise exception 'media path is required' using errcode = '22023';
  end if;

  if (storage.foldername(p_path))[1] = v_user_id::text
     or public.request_media_visible_to_party(v_user_id, p_path) then
    return;
  end if;

  v_location := public.assert_coordinates(p_latitude, p_longitude);

  if not exists (
    select 1
    from public.requests r
    where r.status = 'searching'
      and r.expires_at > now()
      and r.requester_id <> v_user_id
      and public.request_has_media_path(r.category_data, p_path)
      and extensions.ST_DWithin(r.location, v_location, r.search_radius_m)
      and not exists (
        select 1 from public.request_responses rr
        where rr.request_id = r.id
          and rr.provider_id = v_user_id
          and rr.status = 'declined'
      )
  ) then
    raise exception 'media is not available' using errcode = '42501';
  end if;

  delete from public.request_media_read_grants
  where user_id = v_user_id
    and expires_at <= now();

  insert into public.request_media_read_grants (user_id, object_name, expires_at)
  values (v_user_id, p_path, now() + interval '1 hour')
  on conflict (user_id, object_name)
  do update set expires_at = excluded.expires_at;
end;
$$;

revoke all on function public.authorize_request_media_read(text, double precision, double precision)
  from public, anon;
grant execute on function public.authorize_request_media_read(text, double precision, double precision)
  to authenticated;

drop policy if exists "signed in users can read request media" on storage.objects;

create policy "read request media when allowed"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'request-media'
    and public.can_read_request_media(name)
  );

create function public.catalogue_media_is_published(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profile_catalogue_media m
    where m.storage_path = p_name
  );
$$;

revoke all on function public.catalogue_media_is_published(text) from public, anon;
grant execute on function public.catalogue_media_is_published(text) to authenticated;

drop policy if exists "signed in users can read catalogue media" on storage.objects;

create policy "read published catalogue media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'catalogue'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.catalogue_media_is_published(name)
    )
  );

create function public.guard_catalogue_storage_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (storage.foldername(new.storage_path))[1] is distinct from new.user_id::text then
    raise exception 'catalogue media must be stored in your own folder' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profile_catalogue_media_guard_storage_owner on public.profile_catalogue_media;

create trigger profile_catalogue_media_guard_storage_owner
  before insert or update of storage_path on public.profile_catalogue_media
  for each row execute function public.guard_catalogue_storage_owner();

create function public.avatar_is_published(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.avatar_path = p_name
  );
$$;

revoke all on function public.avatar_is_published(text) from public, anon;
grant execute on function public.avatar_is_published(text) to authenticated;

drop policy if exists "signed in users can read avatars" on storage.objects;

create policy "read published avatars"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.avatar_is_published(name)
    )
  );

-- Dispute rows stay visible to the handshake parties after provider_id is cleared.

drop policy if exists service_problems_select_participant on public.service_problems;

create policy service_problems_select_participant
  on public.service_problems
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.requests r
      where r.id = request_id
        and (
          r.requester_id = (select auth.uid())
          or r.provider_id = (select auth.uid())
        )
    )
    or exists (
      select 1
      from public.handshakes h
      where h.request_id = request_id
        and (select auth.uid()) in (h.requester_id, h.provider_id)
    )
  );

revoke all on public.service_problems from anon;
revoke insert, update, delete on public.service_problems from authenticated;
grant select on public.service_problems to authenticated;

revoke all on public.dispute_admin_resolutions from public, anon, authenticated;
