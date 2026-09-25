-- 20260925001400 is already recorded on some databases without this policy.
drop policy if exists "read catalogue media for discovery" on public.profile_catalogue_media;

create policy "read catalogue media for discovery"
  on public.profile_catalogue_media for select to authenticated
  using (true);
