-- The requester's own requests. Exact coordinates appear here because they are the
-- caller's own; RLS on public.requests is what keeps the view to their rows.
--
-- A request that has run past expires_at is reported as expired without a scheduled job
-- flipping the column, matching how the matching functions already filter it out.
create view public.my_requests
with (security_invoker = on) as
select
  r.id as request_id,
  r.category_slug,
  r.description,
  r.scheduled_for,
  r.offered_amount,
  r.currency,
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
  (
    select count(*)::integer from public.request_responses rr
    where rr.request_id = r.id and rr.status = 'pending'
  ) as pending_response_count,
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

revoke all on public.my_requests from public, anon;
grant select on public.my_requests to authenticated;

-- Realtime. Both parties already read these tables under RLS, so a requester gets live
-- responses and both sides see status changes without polling. Providers cannot read
-- public.requests before acceptance, so their inbox refreshes on notification instead.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.requests;
    alter publication supabase_realtime add table public.request_responses;
  end if;
end $$;

-- Avatars are kept in a private bucket and read through short-lived signed URLs, so a
-- profile picture is not a public object on the internet.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Objects live at `<user_id>/<filename>`, which is what ties write access to the owner.
create policy "signed in users can read avatars"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

create policy "users write their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users replace their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users delete their own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
