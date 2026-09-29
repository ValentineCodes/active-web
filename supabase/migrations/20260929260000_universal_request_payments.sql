-- Universal request payments: offer locks wallet funds for discovery; agreed amount (incl.
-- counter offers) is reconciled server-side at selection; completion releases via ledger.

alter table public.requests
  add column if not exists agreed_provider_amount numeric(12, 2)
    check (agreed_provider_amount is null or agreed_provider_amount > 0);

comment on column public.requests.agreed_provider_amount is
  'Provider/responder payout amount after selection (counter offer or original offer).';

create or replace function public.align_request_escrow_to_agreed_amount(
  p_request_id uuid,
  p_agreed_provider_amount numeric,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escrow public.request_escrow%rowtype;
  v_new_charge record;
  v_delta_total numeric;
  v_requester_id uuid;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if p_agreed_provider_amount is null or p_agreed_provider_amount <= 0 then
    raise exception 'agreed amount must be positive' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.wallet_ledger wl
    where wl.idempotency_key = p_idempotency_key || ':align'
  ) then
    return;
  end if;

  select * into v_escrow
  from public.request_escrow re
  where re.request_id = p_request_id
  for update;

  if v_escrow.request_id is null then
    return;
  end if;

  if v_escrow.provider_amount = p_agreed_provider_amount then
    return;
  end if;

  select * into v_new_charge from public.compute_request_charge(p_agreed_provider_amount);

  v_delta_total := v_new_charge.total - v_escrow.total;
  v_requester_id := v_escrow.requester_id;

  if v_delta_total > 0 then
    perform public.ensure_wallet_account(v_requester_id);

    if (
      select wa.available
      from public.wallet_accounts wa
      where wa.user_id = v_requester_id
    ) < v_delta_total then
      raise exception 'insufficient wallet balance to accept this offer' using errcode = '55000';
    end if;

    perform public.post_wallet_ledger(
      p_idempotency_key || ':align',
      v_requester_id,
      p_request_id,
      'escrow_top_up',
      -v_delta_total,
      v_delta_total,
      0
    );
  elsif v_delta_total < 0 then
    perform public.post_wallet_ledger(
      p_idempotency_key || ':align',
      v_requester_id,
      p_request_id,
      'escrow_partial_refund',
      -v_delta_total,
      v_delta_total,
      0
    );
  end if;

  update public.request_escrow
  set provider_amount = v_new_charge.provider_amount,
      service_fee = v_new_charge.service_fee,
      total = v_new_charge.total
  where request_id = p_request_id;
end;
$$;

revoke all on function public.align_request_escrow_to_agreed_amount(uuid, numeric, text)
  from public, anon, authenticated;

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
  v_request_expires_at timestamptz;
  v_offered_amount numeric;
  v_quoted_amount numeric;
  v_agreed_provider_amount numeric;
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

  select r.status, r.payment_status, r.requester_id, r.expires_at, r.offered_amount
    into v_request_status, v_payment, v_requester_id, v_request_expires_at, v_offered_amount
  from public.requests r
  where r.id = v_request_id
  for update;

  if exists (select 1 from public.handshakes h where h.request_id = v_request_id) then
    raise exception 'someone is already helping on this request' using errcode = '55000';
  end if;

  if v_request_status <> 'posted' then
    raise exception 'this request is no longer open for selection' using errcode = '55000';
  end if;

  if v_request_expires_at <= now() then
    raise exception 'this request is no longer open for selection' using errcode = '55000';
  end if;

  select rr.request_id, rr.responder_id, rr.status, rr.quoted_amount
    into v_locked_request_id, v_selected_user_id, v_response_status, v_quoted_amount
  from public.request_responses rr
  where rr.id = p_response_id
  for update;

  if v_locked_request_id is distinct from v_request_id
     or v_response_status is distinct from 'pending' then
    raise exception 'this response is no longer available' using errcode = '55000';
  end if;

  v_agreed_provider_amount := coalesce(nullif(v_quoted_amount, 0), v_offered_amount);

  if v_agreed_provider_amount is null or v_agreed_provider_amount <= 0 then
    raise exception 'this request has no agreed payment amount' using errcode = '55000';
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
    raise exception 'this response is no longer available' using errcode = '55000';
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
      selected_user_id = v_selected_user_id,
      agreed_provider_amount = v_agreed_provider_amount
  where id = v_request_id
    and status = 'posted';

  if not found then
    raise exception 'this request is no longer open for selection' using errcode = '55000';
  end if;

  perform public.set_user_attendance(v_selected_user_id, v_request_id);

  insert into public.handshakes (request_id, response_id, requester_id, selected_user_id)
  values (v_request_id, p_response_id, v_requester_id, v_selected_user_id);

  if v_payment = 'locked' then
    perform public.align_request_escrow_to_agreed_amount(
      v_request_id,
      v_agreed_provider_amount,
      'handshake:' || v_request_id::text
    );

    perform public.apply_payment_transition(
      v_request_id,
      'pending'::public.payment_status,
      'handshake:' || v_request_id::text
    );
  end if;

  return v_request_id;
end;
$$;

drop view if exists public.my_requests;

create view public.my_requests
with (security_invoker = on) as
select
  r.id as request_id,
  r.title,
  r.description,
  r.scheduled_for,
  r.offered_amount,
  r.agreed_provider_amount,
  r.currency,
  r.payment_status,
  r.location_label,
  extensions.ST_Y(r.location::extensions.geometry) as latitude,
  extensions.ST_X(r.location::extensions.geometry) as longitude,
  case
    when r.status = 'posted' and r.expires_at <= now() then 'expired'::public.request_status
    else r.status
  end as status,
  r.selected_user_id,
  r.source_request_id,
  (
    select count(*)::integer from public.request_responses rr
    where rr.request_id = r.id and rr.status = 'pending'
  ) as pending_response_count,
  exists (select 1 from public.ratings g where g.request_id = r.id) as is_rated,
  r.created_at,
  r.updated_at,
  r.submitted_at,
  r.expires_at,
  r.accepted_at,
  r.started_at,
  r.completed_at,
  r.cancelled_at
from public.requests r
where r.requester_id = (select auth.uid());

grant select on public.my_requests to authenticated;

drop function if exists public.browse_nearby_requests(double precision, double precision);
drop function if exists public.browse_request(uuid, double precision, double precision);

create function public.browse_nearby_requests(
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  request_id uuid,
  title text,
  description text,
  scheduled_for timestamptz,
  offered_amount numeric,
  currency text,
  location_label text,
  distance_m integer,
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
  with viewer as (
    select
      public.assert_onboarded() as user_id,
      public.assert_coordinates(p_latitude, p_longitude) as location
  )
  select
    r.id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(extensions.ST_Distance(r.location, viewer.location)),
    p.display_name,
    p.avatar_path,
    p.rating_average,
    p.rating_count
  from viewer
  join public.requests r
    on r.status = 'posted'
   and r.expires_at > now()
   and r.offered_amount is not null
   and r.offered_amount > 0
   and r.payment_status = 'locked'::public.payment_status
   and r.requester_id <> viewer.user_id
   and extensions.ST_DWithin(r.location, viewer.location, public.discovery_radius_m())
   and not exists (
     select 1 from public.request_responses rr
     where rr.request_id = r.id
       and rr.responder_id = viewer.user_id
       and rr.status = 'declined'
   )
  join public.profiles p on p.id = r.requester_id
  order by extensions.ST_Distance(r.location, viewer.location) asc, r.created_at desc
  limit 40;
$$;

create function public.browse_request(
  p_request_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  request_id uuid,
  title text,
  description text,
  scheduled_for timestamptz,
  offered_amount numeric,
  currency text,
  location_label text,
  distance_m integer,
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
  with viewer as (
    select
      public.assert_onboarded() as user_id,
      public.assert_coordinates(p_latitude, p_longitude) as location
  )
  select
    r.id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(extensions.ST_Distance(r.location, viewer.location)),
    p.display_name,
    p.avatar_path,
    p.rating_average,
    p.rating_count
  from viewer
  join public.requests r
    on r.id = p_request_id
   and r.status = 'posted'
   and r.expires_at > now()
   and r.offered_amount is not null
   and r.offered_amount > 0
   and r.payment_status = 'locked'::public.payment_status
   and r.requester_id <> viewer.user_id
   and extensions.ST_DWithin(r.location, viewer.location, public.discovery_radius_m())
  join public.profiles p on p.id = r.requester_id;
$$;

grant execute on function public.browse_nearby_requests(double precision, double precision) to authenticated;
grant execute on function public.browse_request(uuid, double precision, double precision) to authenticated;

drop function if exists public.get_engagement(uuid);

create function public.get_engagement(p_request_id uuid)
returns table (
  request_id uuid,
  title text,
  description text,
  scheduled_for timestamptz,
  offered_amount numeric,
  agreed_provider_amount numeric,
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
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.agreed_provider_amount,
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
   and me.user_id in (r.requester_id, r.selected_user_id)
  join public.profiles counterparty
    on counterparty.id = case
      when r.requester_id = me.user_id then r.selected_user_id
      else r.requester_id
    end
  left join public.request_responses accepted on accepted.id = r.accepted_response_id
  left join public.service_problems sp
    on sp.request_id = r.id
   and sp.status = 'open'
  left join public.ratings rating on rating.request_id = r.id
  left join public.handshakes h on h.request_id = r.id;
$$;

grant execute on function public.get_engagement(uuid) to authenticated;
