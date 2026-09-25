-- Moving category and private storage for request attachment photos (repair, etc.).

insert into public.service_categories (slug, label, tagline, icon, sort_order)
values (
  'moving',
  'Moving',
  'Move furniture or belongings',
  'archive-outline',
  55
)
on conflict (slug) do update
set label = excluded.label,
    tagline = excluded.tagline,
    icon = excluded.icon,
    sort_order = excluded.sort_order;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'request-media',
  'request-media',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "signed in users can read request media"
  on storage.objects for select to authenticated
  using (bucket_id = 'request-media');

create policy "users write their own request media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'request-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users replace their own request media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'request-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users delete their own request media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'request-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
