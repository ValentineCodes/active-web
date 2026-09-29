-- Remove category-era discovery media, helpers, and notifications.

drop function if exists public.nearby_requests();
drop function if exists public.browse_nearby_requests(double precision, double precision, text);
drop function if exists public.browse_request(uuid, double precision, double precision, text);

drop function if exists public.authorize_request_media_read(
  text, double precision, double precision
);

drop table if exists public.request_media_read_grants;

drop function if exists public.redact_discovery_category_data(jsonb);
drop function if exists public.request_has_media_path(jsonb, text);

create or replace function public.request_media_visible_to_party(p_user_id uuid, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.service_problems sp
    join public.requests r on r.id = sp.request_id
    where p_name = any (sp.evidence_paths)
      and (
        r.requester_id = p_user_id
        or r.selected_user_id = p_user_id
      )
  );
$$;

create or replace function public.can_read_request_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (storage.foldername(p_name))[1] = (select auth.uid())::text
    or public.request_media_visible_to_party((select auth.uid()), p_name);
$$;

revoke all on function public.request_media_visible_to_party(uuid, text)
  from public, anon, authenticated;
revoke all on function public.can_read_request_media(text) from public, anon;
grant execute on function public.can_read_request_media(text) to authenticated;

create or replace function public.notify_matching_providers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  return new;
end;
$$;

create or replace function public.notify_requester_request_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'posted'::public.request_status then
    return new;
  end if;

  perform public.send_push(
    array[new.requester_id],
    'Request is live',
    format(
      'People nearby can see “%s”. We''ll notify you when someone responds.',
      left(new.title, 80)
    ),
    format('/request/%s', new.id)
  );

  return new;
end;
$$;

drop trigger if exists requests_notify_requester_published on public.requests;

create trigger requests_notify_requester_published
  after insert on public.requests
  for each row
  when (new.status = 'posted'::public.request_status)
  execute function public.notify_requester_request_published();
