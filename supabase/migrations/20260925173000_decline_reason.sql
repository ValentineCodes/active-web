-- The requester may say why they turned a response down. The reason is optional.
-- Other responses declined because someone else was chosen stay without one.

alter table public.request_responses
  add column decline_reason text check (
    decline_reason is null or char_length(btrim(decline_reason)) between 1 and 500
  );

drop function public.decline_response(uuid);

create function public.decline_response(
  p_response_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_updated uuid;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'decline reason must be 500 characters or fewer' using errcode = '22023';
  end if;

  update public.request_responses rr
  set status = 'declined',
      resolved_at = now(),
      decline_reason = v_reason
  where rr.id = p_response_id
    and rr.status = 'pending'
    and exists (
      select 1 from public.requests r
      where r.id = rr.request_id and r.requester_id = v_user_id
    )
  returning rr.id into v_updated;

  if v_updated is null then
    raise exception 'this response is no longer pending' using errcode = '55000';
  end if;
end;
$$;

revoke execute on function public.decline_response(uuid, text) from public, anon;
grant execute on function public.decline_response(uuid, text) to authenticated;

drop function public.my_responses();

create function public.my_responses()
returns table (
  response_id uuid,
  request_id uuid,
  category_slug text,
  description text,
  location_label text,
  distance_m integer,
  scheduled_for timestamptz,
  offered_amount numeric,
  quoted_amount numeric,
  currency text,
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
  select
    rr.id,
    r.id,
    r.category_slug,
    r.description,
    r.location_label,
    rr.distance_m,
    r.scheduled_for,
    r.offered_amount,
    rr.quoted_amount,
    r.currency,
    rr.status,
    r.status,
    p.display_name,
    p.avatar_path,
    rr.created_at,
    rr.decline_reason
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  join public.profiles p on p.id = r.requester_id
  where rr.provider_id = public.assert_authenticated()
  order by rr.created_at desc;
$$;

revoke execute on function public.my_responses() from public, anon;
grant execute on function public.my_responses() to authenticated;
