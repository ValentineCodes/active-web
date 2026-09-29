-- Active schema (split from squashed baseline for reviewability).
-- Fresh environments: supabase db reset. After drift: squash again if needed.

-- Row level security policies and realtime publication.

ALTER TABLE "public"."dispute_admin_resolutions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."handshakes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."idempotent_operations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "manage own catalogue media" ON "public"."profile_catalogue_media" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "manage own push tokens" ON "public"."push_tokens" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."notification_inbox" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_inbox_select_own" ON "public"."notification_inbox" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "parties read handshake" ON "public"."handshakes" FOR SELECT TO "authenticated" USING ((("requester_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("selected_user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "parties read the rating" ON "public"."ratings" FOR SELECT TO "authenticated" USING ((("rater_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("ratee_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "parties read the request" ON "public"."requests" FOR SELECT TO "authenticated" USING ((("requester_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("selected_user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "parties read the response" ON "public"."request_responses" FOR SELECT TO "authenticated" USING ((("responder_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "request_responses"."request_id") AND ("r"."requester_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."payment_transitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_wallet" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_catalogue_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ratings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read catalogue media for discovery" ON "public"."profile_catalogue_media" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "read own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."request_escrow" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."request_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."request_status_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "request_status_events_select_participant" ON "public"."request_status_events" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "request_status_events"."request_id") AND (("r"."requester_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("r"."selected_user_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (EXISTS ( SELECT 1
   FROM "public"."handshakes" "h"
  WHERE (("h"."request_id" = "h"."request_id") AND ("h"."selected_user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."handshakes" "h"
  WHERE (("h"."request_id" = "h"."request_id") AND ("h"."requester_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_problems" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_problems_select_participant" ON "public"."service_problems" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "service_problems"."request_id") AND (("r"."requester_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("r"."selected_user_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (EXISTS ( SELECT 1
   FROM "public"."handshakes" "h"
  WHERE (("h"."request_id" = "h"."request_id") AND ((( SELECT "auth"."uid"() AS "uid") = "h"."requester_id") OR (( SELECT "auth"."uid"() AS "uid") = "h"."selected_user_id")))))));



CREATE POLICY "update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_attendance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_attendance_select_own" ON "public"."user_attendance" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "users read own wallet" ON "public"."wallet_accounts" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."wallet_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallet_ledger" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."request_responses";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."requests";
