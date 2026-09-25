-- Requesters read provider catalogue rows when comparing responses (pre-handshake).
create policy "read catalogue media for discovery"
  on public.profile_catalogue_media for select to authenticated
  using (true);
