-- Active schema (split from squashed baseline for reviewability).
-- Fresh environments: supabase db reset. After drift: squash again if needed.

-- Triggers and foreign-key constraints.

CREATE OR REPLACE TRIGGER "handshakes_no_update" BEFORE DELETE OR UPDATE ON "public"."handshakes" FOR EACH ROW EXECUTE FUNCTION "public"."guard_handshake_immutable"();



CREATE OR REPLACE TRIGGER "payment_transitions_notify" AFTER INSERT ON "public"."payment_transitions" FOR EACH ROW WHEN (("new"."to_status" = ANY (ARRAY['locked'::"public"."payment_status", 'refunded'::"public"."payment_status"]))) EXECUTE FUNCTION "public"."notify_payment_transition"();



CREATE OR REPLACE TRIGGER "profile_catalogue_media_guard_limits" BEFORE INSERT ON "public"."profile_catalogue_media" FOR EACH ROW EXECUTE FUNCTION "public"."guard_profile_catalogue_limits"();



CREATE OR REPLACE TRIGGER "profile_catalogue_media_guard_storage_owner" BEFORE INSERT OR UPDATE OF "storage_path" ON "public"."profile_catalogue_media" FOR EACH ROW EXECUTE FUNCTION "public"."guard_catalogue_storage_owner"();



CREATE OR REPLACE TRIGGER "profiles_guard_columns" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_profile_columns"();



CREATE OR REPLACE TRIGGER "profiles_touch_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "ratings_apply_to_profile" AFTER INSERT ON "public"."ratings" FOR EACH ROW EXECUTE FUNCTION "public"."apply_rating_to_profile"();



CREATE OR REPLACE TRIGGER "request_responses_notify_requester" AFTER INSERT ON "public"."request_responses" FOR EACH ROW EXECUTE FUNCTION "public"."notify_requester_of_response"();



CREATE OR REPLACE TRIGGER "request_responses_notify_responder" AFTER INSERT ON "public"."request_responses" FOR EACH ROW WHEN (("new"."status" = 'pending'::"public"."response_status")) EXECUTE FUNCTION "public"."notify_responder_of_response_submitted"();



CREATE OR REPLACE TRIGGER "requests_guard_history_immutable" BEFORE UPDATE ON "public"."requests" FOR EACH ROW EXECUTE FUNCTION "public"."guard_request_history_immutable"();



CREATE OR REPLACE TRIGGER "requests_notify_acceptance" AFTER UPDATE OF "status" ON "public"."requests" FOR EACH ROW WHEN ((("old"."status" = 'searching'::"public"."request_status") AND ("new"."status" = 'accepted'::"public"."request_status"))) EXECUTE FUNCTION "public"."notify_provider_of_acceptance"();



CREATE OR REPLACE TRIGGER "requests_notify_completion_pending" AFTER UPDATE OF "status" ON "public"."requests" FOR EACH ROW WHEN ((("old"."status" IS DISTINCT FROM 'completion_pending'::"public"."request_status") AND ("new"."status" = 'completion_pending'::"public"."request_status"))) EXECUTE FUNCTION "public"."notify_requester_of_completion_pending"();



CREATE OR REPLACE TRIGGER "requests_notify_providers" AFTER INSERT ON "public"."requests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_matching_providers"();



CREATE OR REPLACE TRIGGER "requests_notify_requester_provider_selected" AFTER UPDATE OF "status" ON "public"."requests" FOR EACH ROW WHEN ((("old"."status" IS DISTINCT FROM 'accepted'::"public"."request_status") AND ("new"."status" = 'accepted'::"public"."request_status"))) EXECUTE FUNCTION "public"."notify_requester_of_provider_selected"();



CREATE OR REPLACE TRIGGER "requests_notify_requester_published" AFTER INSERT ON "public"."requests" FOR EACH ROW WHEN (("new"."status" = 'posted'::"public"."request_status")) EXECUTE FUNCTION "public"."notify_requester_request_published"();



CREATE OR REPLACE TRIGGER "requests_touch_updated_at" BEFORE UPDATE ON "public"."requests" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "user_attendance_touch_updated_at" BEFORE UPDATE ON "public"."user_attendance" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



ALTER TABLE ONLY "public"."dispute_admin_resolutions"
    ADD CONSTRAINT "dispute_admin_resolutions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."dispute_admin_resolutions"
    ADD CONSTRAINT "dispute_admin_resolutions_service_problem_id_fkey" FOREIGN KEY ("service_problem_id") REFERENCES "public"."service_problems"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."handshakes"
    ADD CONSTRAINT "handshakes_provider_id_fkey" FOREIGN KEY ("selected_user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."handshakes"
    ADD CONSTRAINT "handshakes_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."handshakes"
    ADD CONSTRAINT "handshakes_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."handshakes"
    ADD CONSTRAINT "handshakes_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."request_responses"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."idempotent_operations"
    ADD CONSTRAINT "idempotent_operations_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_inbox"
    ADD CONSTRAINT "notification_inbox_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_transitions"
    ADD CONSTRAINT "payment_transitions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."profile_catalogue_media"
    ADD CONSTRAINT "profile_catalogue_media_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_ratee_id_fkey" FOREIGN KEY ("ratee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_rater_id_fkey" FOREIGN KEY ("rater_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."request_escrow"
    ADD CONSTRAINT "request_escrow_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."request_escrow"
    ADD CONSTRAINT "request_escrow_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."request_responses"
    ADD CONSTRAINT "request_responses_provider_id_fkey" FOREIGN KEY ("responder_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."request_responses"
    ADD CONSTRAINT "request_responses_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."request_status_events"
    ADD CONSTRAINT "request_status_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."request_status_events"
    ADD CONSTRAINT "request_status_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."requests"
    ADD CONSTRAINT "requests_accepted_response_fkey" FOREIGN KEY ("accepted_response_id") REFERENCES "public"."request_responses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."requests"
    ADD CONSTRAINT "requests_provider_id_fkey" FOREIGN KEY ("selected_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."requests"
    ADD CONSTRAINT "requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."requests"
    ADD CONSTRAINT "requests_source_request_id_fkey" FOREIGN KEY ("source_request_id") REFERENCES "public"."requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."service_problems"
    ADD CONSTRAINT "service_problems_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."service_problems"
    ADD CONSTRAINT "service_problems_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_attendance"
    ADD CONSTRAINT "user_attendance_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_attendance"
    ADD CONSTRAINT "user_attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_accounts"
    ADD CONSTRAINT "wallet_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_ledger"
    ADD CONSTRAINT "wallet_ledger_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."wallet_ledger"
    ADD CONSTRAINT "wallet_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;


