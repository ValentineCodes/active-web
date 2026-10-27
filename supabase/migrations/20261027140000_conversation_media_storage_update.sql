-- Allow retry/upsert uploads to reserved conversation-media paths (INSERT-only blocked updates).

DROP POLICY IF EXISTS "users update reserved conversation media" ON storage.objects;

CREATE POLICY "users update reserved conversation media" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'conversation-media'
    AND public.can_write_conversation_media(name)
  )
  WITH CHECK (
    bucket_id = 'conversation-media'
    AND public.can_write_conversation_media(name)
  );
