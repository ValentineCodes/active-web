CREATE OR REPLACE FUNCTION "public"."mark_notification_inbox_item_read"("p_notification_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
begin
  update public.notification_inbox
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = v_user_id;
end;
$$;

ALTER FUNCTION "public"."mark_notification_inbox_item_read"("p_notification_id" "uuid") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."mark_notification_inbox_item_read"("p_notification_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_notification_inbox_item_read"("p_notification_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_notification_inbox_item_read"("p_notification_id" "uuid") TO "service_role";
