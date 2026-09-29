-- Active schema (split from squashed baseline for reviewability).
-- Fresh environments: supabase db reset. After drift: squash again if needed.

-- Private storage buckets and RLS on storage.objects.
-- Objects use `<user_id>/<filename>` so folder name ties writes to auth.uid().

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'avatars',
    'avatars',
    false,
    2097152,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'catalogue',
    'catalogue',
    false,
    52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
  ),
  (
    'request-media',
    'request-media',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do nothing;

CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();



CREATE POLICY "read published avatars" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND ((("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text") OR "public"."avatar_is_published"("name"))));



CREATE POLICY "read published catalogue media" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'catalogue'::"text") AND ((("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text") OR "public"."catalogue_media_is_published"("name"))));



CREATE POLICY "read request media when allowed" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'request-media'::"text") AND "public"."can_read_request_media"("name")));



CREATE POLICY "users delete their own avatar" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "users delete their own catalogue media" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'catalogue'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "users delete their own request media" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'request-media'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "users replace their own avatar" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "users replace their own catalogue media" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'catalogue'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "users replace their own request media" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'request-media'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "users write their own avatar" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "users write their own catalogue media" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'catalogue'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



CREATE POLICY "users write their own request media" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'request-media'::"text") AND (("storage"."foldername"("name"))[1] = (( SELECT "auth"."uid"() AS "uid"))::"text")));



