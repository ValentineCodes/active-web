create or replace function public.provider_location_recently_updated(
  p_provider_id uuid,
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_availability pa
    where pa.user_id = p_provider_id
      and pa.committed_request_id = p_request_id
      and pa.location is not null
      and pa.updated_at > now() - interval '15 minutes'
  );
$$;

revoke all on function public.provider_location_recently_updated(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.provider_location_updated_since_report(
  p_provider_id uuid,
  p_request_id uuid,
  p_reported_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.provider_availability pa
    where pa.user_id = p_provider_id
      and pa.committed_request_id = p_request_id
      and pa.location is not null
      and pa.updated_at > p_reported_at
      and pa.updated_at > now() - interval '15 minutes'
  );
$$;

revoke all on function public.provider_location_updated_since_report(uuid, uuid, timestamptz)
  from public, anon, authenticated;
