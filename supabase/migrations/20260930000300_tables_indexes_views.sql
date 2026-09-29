-- Active schema (split from squashed baseline for reviewability).
-- Fresh environments: supabase db reset. After drift: squash again if needed.

-- Tables, constraints, indexes, and security-invoker views.

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."dispute_admin_resolutions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_problem_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "outcome" "text" NOT NULL,
    "admin_note" "text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "request_status_after" "public"."request_status" NOT NULL,
    "payment_status_after" "public"."payment_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dispute_admin_resolutions_admin_note_check" CHECK (("char_length"("btrim"("admin_note")) >= 1)),
    CONSTRAINT "dispute_admin_resolutions_outcome_check" CHECK (("outcome" = ANY (ARRAY['refund_requester'::"text", 'pay_provider'::"text", 'resume_service'::"text"])))
);


ALTER TABLE "public"."dispute_admin_resolutions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."handshakes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "response_id" "uuid" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "selected_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."handshakes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."idempotent_operations" (
    "key" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "request_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."idempotent_operations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_attendance" (
    "user_id" "uuid" NOT NULL,
    "request_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_attendance" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."my_attendance" WITH ("security_invoker"='on') AS
 SELECT "user_id",
    "request_id" AS "attending_request_id",
    "updated_at"
   FROM "public"."user_attendance" "ua"
  WHERE ("user_id" = ( SELECT "auth"."uid"() AS "uid"));


ALTER VIEW "public"."my_attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "rater_id" "uuid" NOT NULL,
    "ratee_id" "uuid" NOT NULL,
    "stars" smallint NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ratings_comment_check" CHECK (("char_length"("btrim"("comment")) <= 500)),
    CONSTRAINT "ratings_stars_check" CHECK ((("stars" >= 1) AND ("stars" <= 5)))
);


ALTER TABLE "public"."ratings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."request_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "responder_id" "uuid" NOT NULL,
    "message" "text",
    "quoted_amount" numeric(12,2),
    "distance_m" integer NOT NULL,
    "status" "public"."response_status" DEFAULT 'pending'::"public"."response_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "decline_reason" "text",
    CONSTRAINT "request_responses_decline_reason_check" CHECK ((("decline_reason" IS NULL) OR (("char_length"("btrim"("decline_reason")) >= 1) AND ("char_length"("btrim"("decline_reason")) <= 500)))),
    CONSTRAINT "request_responses_distance_m_check" CHECK (("distance_m" >= 0)),
    CONSTRAINT "request_responses_message_check" CHECK (("char_length"("btrim"("message")) <= 500)),
    CONSTRAINT "request_responses_quoted_amount_check" CHECK (("quoted_amount" >= (0)::numeric))
);


ALTER TABLE "public"."request_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "description" "text",
    "scheduled_for" timestamp with time zone,
    "offered_amount" numeric(12,2),
    "currency" "text" DEFAULT 'NGN'::"text" NOT NULL,
    "location" "extensions"."geography"(Point,4326) NOT NULL,
    "location_label" "text" NOT NULL,
    "status" "public"."request_status" DEFAULT 'draft'::"public"."request_status" NOT NULL,
    "accepted_response_id" "uuid",
    "selected_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "payment_status" "public"."payment_status" DEFAULT 'not_required'::"public"."payment_status" NOT NULL,
    "source_request_id" "uuid",
    "completion_confirm_by" timestamp with time zone,
    "expiry_reminder_sent_at" timestamp with time zone,
    "completion_reminder_sent_at" timestamp with time zone,
    "title" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "agreed_provider_amount" numeric(12,2),
    CONSTRAINT "requests_accepted_has_selected" CHECK ((("status" = ANY (ARRAY['accepted'::"public"."request_status", 'in_progress'::"public"."request_status", 'completion_pending'::"public"."request_status", 'completed'::"public"."request_status", 'disputed'::"public"."request_status", 'no_show'::"public"."request_status"])) = ("selected_user_id" IS NOT NULL))),
    CONSTRAINT "requests_agreed_provider_amount_check" CHECK ((("agreed_provider_amount" IS NULL) OR ("agreed_provider_amount" > (0)::numeric))),
    CONSTRAINT "requests_currency_check" CHECK (("char_length"("currency") = 3)),
    CONSTRAINT "requests_description_check" CHECK ((("char_length"("btrim"("description")) >= 10) AND ("char_length"("btrim"("description")) <= 1000))),
    CONSTRAINT "requests_description_length" CHECK ((("description" IS NULL) OR (("char_length"("btrim"("description")) >= 1) AND ("char_length"("btrim"("description")) <= 1000)))),
    CONSTRAINT "requests_location_label_check" CHECK ((("char_length"("btrim"("location_label")) >= 2) AND ("char_length"("btrim"("location_label")) <= 120))),
    CONSTRAINT "requests_offered_amount_check" CHECK (("offered_amount" >= (0)::numeric)),
    CONSTRAINT "requests_requester_is_not_selected" CHECK (("selected_user_id" IS DISTINCT FROM "requester_id")),
    CONSTRAINT "requests_title_length" CHECK ((("char_length"("btrim"("title")) >= 3) AND ("char_length"("btrim"("title")) <= 120)))
);


ALTER TABLE "public"."requests" OWNER TO "postgres";


COMMENT ON COLUMN "public"."requests"."agreed_provider_amount" IS 'Provider/responder payout amount after selection (counter offer or original offer).';



CREATE OR REPLACE VIEW "public"."my_requests" WITH ("security_invoker"='on') AS
 SELECT "id" AS "request_id",
    "title",
    "description",
    "scheduled_for",
    "offered_amount",
    "agreed_provider_amount",
    "currency",
    "payment_status",
    "location_label",
    "extensions"."st_y"(("location")::"extensions"."geometry") AS "latitude",
    "extensions"."st_x"(("location")::"extensions"."geometry") AS "longitude",
        CASE
            WHEN (("status" = 'posted'::"public"."request_status") AND ("expires_at" <= "now"())) THEN 'expired'::"public"."request_status"
            ELSE "status"
        END AS "status",
    "selected_user_id",
    "source_request_id",
    ( SELECT ("count"(*))::integer AS "count"
           FROM "public"."request_responses" "rr"
          WHERE (("rr"."request_id" = "r"."id") AND ("rr"."status" = 'pending'::"public"."response_status"))) AS "pending_response_count",
    (EXISTS ( SELECT 1
           FROM "public"."ratings" "g"
          WHERE ("g"."request_id" = "r"."id"))) AS "is_rated",
    "created_at",
    "updated_at",
    "submitted_at",
    "expires_at",
    "accepted_at",
    "started_at",
    "completed_at",
    "cancelled_at"
   FROM "public"."requests" "r"
  WHERE ("requester_id" = ( SELECT "auth"."uid"() AS "uid"));


ALTER VIEW "public"."my_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_accounts" (
    "user_id" "uuid" NOT NULL,
    "available" numeric(12,2) DEFAULT 0 NOT NULL,
    "locked" numeric(12,2) DEFAULT 0 NOT NULL,
    "pending" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'NGN'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallet_accounts_available_check" CHECK (("available" >= (0)::numeric)),
    CONSTRAINT "wallet_accounts_currency_check" CHECK (("char_length"("currency") = 3)),
    CONSTRAINT "wallet_accounts_locked_check" CHECK (("locked" >= (0)::numeric)),
    CONSTRAINT "wallet_accounts_pending_check" CHECK (("pending" >= (0)::numeric))
);


ALTER TABLE "public"."wallet_accounts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."my_wallet" WITH ("security_invoker"='on') AS
 SELECT "user_id",
    "available",
    "locked",
    "pending",
    "currency",
    "updated_at"
   FROM "public"."wallet_accounts" "wa"
  WHERE ("user_id" = ( SELECT "auth"."uid"() AS "uid"));


ALTER VIEW "public"."my_wallet" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "user_id" "uuid",
    "request_id" "uuid",
    "kind" "text" NOT NULL,
    "available_delta" numeric(12,2) DEFAULT 0 NOT NULL,
    "locked_delta" numeric(12,2) DEFAULT 0 NOT NULL,
    "pending_delta" numeric(12,2) DEFAULT 0 NOT NULL,
    "platform_available_delta" numeric(12,2) DEFAULT 0 NOT NULL,
    "external_reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wallet_ledger" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."my_wallet_activity" WITH ("security_invoker"='on') AS
 SELECT "id",
    "kind",
    "available_delta",
    "locked_delta",
    "pending_delta",
    "request_id",
    "created_at"
   FROM "public"."wallet_ledger" "wl"
  WHERE ("user_id" = ( SELECT "auth"."uid"() AS "uid"));


ALTER VIEW "public"."my_wallet_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_inbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    CONSTRAINT "notification_inbox_body_check" CHECK (("char_length"("body") <= 500)),
    CONSTRAINT "notification_inbox_title_check" CHECK ((("char_length"("btrim"("title")) >= 1) AND ("char_length"("btrim"("title")) <= 120))),
    CONSTRAINT "notification_inbox_url_check" CHECK ((("url" IS NULL) OR ("char_length"("url") <= 200)))
);


ALTER TABLE "public"."notification_inbox" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_transitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "from_status" "public"."payment_status" NOT NULL,
    "to_status" "public"."payment_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_transitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_wallet" (
    "id" smallint DEFAULT 1 NOT NULL,
    "available" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'NGN'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "platform_wallet_available_check" CHECK (("available" >= (0)::numeric)),
    CONSTRAINT "platform_wallet_currency_check" CHECK (("char_length"("currency") = 3)),
    CONSTRAINT "platform_wallet_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."platform_wallet" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_catalogue_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "public"."profile_catalogue_kind" NOT NULL,
    "storage_path" "text" NOT NULL,
    "sort_order" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_catalogue_media_sort_order_check" CHECK ((("sort_order" >= 0) AND ("sort_order" <= 5)))
);


ALTER TABLE "public"."profile_catalogue_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "avatar_path" "text",
    "phone" "text",
    "bio" "text",
    "rating_average" numeric(3,2),
    "rating_count" integer DEFAULT 0 NOT NULL,
    "jobs_completed" integer DEFAULT 0 NOT NULL,
    "requests_completed" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "avatar_captured_in_app" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_bio_check" CHECK (("char_length"("bio") <= 280)),
    CONSTRAINT "profiles_display_name_check" CHECK ((("char_length"("btrim"("display_name")) >= 2) AND ("char_length"("btrim"("display_name")) <= 60)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "token" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text"])))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."request_escrow" (
    "request_id" "uuid" NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "provider_amount" numeric(12,2) NOT NULL,
    "service_fee" numeric(12,2) NOT NULL,
    "total" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'NGN'::"text" NOT NULL,
    "escrow_bucket" "text" DEFAULT 'locked'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "request_escrow_check" CHECK (("total" = ("provider_amount" + "service_fee"))),
    CONSTRAINT "request_escrow_currency_check" CHECK (("char_length"("currency") = 3)),
    CONSTRAINT "request_escrow_escrow_bucket_check" CHECK (("escrow_bucket" = ANY (ARRAY['locked'::"text", 'pending'::"text"]))),
    CONSTRAINT "request_escrow_provider_amount_check" CHECK (("provider_amount" > (0)::numeric)),
    CONSTRAINT "request_escrow_service_fee_check" CHECK (("service_fee" >= (0)::numeric))
);


ALTER TABLE "public"."request_escrow" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."request_status_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "from_status" "public"."request_status" NOT NULL,
    "to_status" "public"."request_status" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."request_status_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_problems" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "kind" "public"."service_problem_kind" NOT NULL,
    "reported_by" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "status_before" "public"."request_status" NOT NULL,
    "payment_before" "public"."payment_status" NOT NULL,
    "respond_by" timestamp with time zone,
    "resolution" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "evidence_paths" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "service_problems_resolution_check" CHECK ((("resolution" IS NULL) OR ("resolution" = ANY (ARRAY['auto_client_refund'::"text", 'auto_provider_paid'::"text", 'contested'::"text", 'manual'::"text", 'admin_refund_requester'::"text", 'admin_pay_provider'::"text", 'admin_resume_service'::"text"])))),
    CONSTRAINT "service_problems_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."service_problems" OWNER TO "postgres";


ALTER TABLE ONLY "public"."dispute_admin_resolutions"
    ADD CONSTRAINT "dispute_admin_resolutions_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."dispute_admin_resolutions"
    ADD CONSTRAINT "dispute_admin_resolutions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."handshakes"
    ADD CONSTRAINT "handshakes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."handshakes"
    ADD CONSTRAINT "handshakes_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."handshakes"
    ADD CONSTRAINT "handshakes_response_id_key" UNIQUE ("response_id");



ALTER TABLE ONLY "public"."idempotent_operations"
    ADD CONSTRAINT "idempotent_operations_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."notification_inbox"
    ADD CONSTRAINT "notification_inbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_transitions"
    ADD CONSTRAINT "payment_transitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_transitions"
    ADD CONSTRAINT "payment_transitions_request_id_idempotency_key_key" UNIQUE ("request_id", "idempotency_key");



ALTER TABLE ONLY "public"."platform_wallet"
    ADD CONSTRAINT "platform_wallet_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_catalogue_media"
    ADD CONSTRAINT "profile_catalogue_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_catalogue_media"
    ADD CONSTRAINT "profile_catalogue_media_user_id_kind_sort_order_key" UNIQUE ("user_id", "kind", "sort_order");



ALTER TABLE ONLY "public"."profile_catalogue_media"
    ADD CONSTRAINT "profile_catalogue_media_user_id_storage_path_key" UNIQUE ("user_id", "storage_path");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."request_escrow"
    ADD CONSTRAINT "request_escrow_pkey" PRIMARY KEY ("request_id");



ALTER TABLE ONLY "public"."request_responses"
    ADD CONSTRAINT "request_responses_one_per_user" UNIQUE ("request_id", "responder_id");



ALTER TABLE ONLY "public"."request_responses"
    ADD CONSTRAINT "request_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."request_status_events"
    ADD CONSTRAINT "request_status_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."request_status_events"
    ADD CONSTRAINT "request_status_events_request_id_idempotency_key_key" UNIQUE ("request_id", "idempotency_key");



ALTER TABLE ONLY "public"."requests"
    ADD CONSTRAINT "requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_problems"
    ADD CONSTRAINT "service_problems_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_attendance"
    ADD CONSTRAINT "user_attendance_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."wallet_accounts"
    ADD CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."wallet_ledger"
    ADD CONSTRAINT "wallet_ledger_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."wallet_ledger"
    ADD CONSTRAINT "wallet_ledger_pkey" PRIMARY KEY ("id");



CREATE INDEX "dispute_admin_resolutions_request_idx" ON "public"."dispute_admin_resolutions" USING "btree" ("request_id", "created_at");



CREATE INDEX "handshakes_selected_user_idx" ON "public"."handshakes" USING "btree" ("selected_user_id", "created_at" DESC);



CREATE INDEX "notification_inbox_user_created_idx" ON "public"."notification_inbox" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "notification_inbox_user_unread_idx" ON "public"."notification_inbox" USING "btree" ("user_id") WHERE ("read_at" IS NULL);



CREATE INDEX "payment_transitions_request_idx" ON "public"."payment_transitions" USING "btree" ("request_id", "created_at");



CREATE INDEX "profile_catalogue_media_user_idx" ON "public"."profile_catalogue_media" USING "btree" ("user_id", "kind");



CREATE INDEX "push_tokens_user_idx" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "ratings_ratee_idx" ON "public"."ratings" USING "btree" ("ratee_id");



CREATE INDEX "request_escrow_requester_idx" ON "public"."request_escrow" USING "btree" ("requester_id");



CREATE INDEX "request_responses_provider_idx" ON "public"."request_responses" USING "btree" ("responder_id", "created_at" DESC);



CREATE INDEX "request_responses_request_idx" ON "public"."request_responses" USING "btree" ("request_id", "created_at" DESC);



CREATE INDEX "request_responses_responder_idx" ON "public"."request_responses" USING "btree" ("responder_id", "created_at" DESC);



CREATE INDEX "request_status_events_request_idx" ON "public"."request_status_events" USING "btree" ("request_id", "created_at");



CREATE INDEX "requests_matching_idx" ON "public"."requests" USING "gist" ("location") WHERE ("status" = 'posted'::"public"."request_status");



CREATE UNIQUE INDEX "requests_one_open_provider_commitment" ON "public"."requests" USING "btree" ("selected_user_id") WHERE (("selected_user_id" IS NOT NULL) AND ("status" = ANY (ARRAY['accepted'::"public"."request_status", 'in_progress'::"public"."request_status", 'completion_pending'::"public"."request_status", 'disputed'::"public"."request_status"])));



CREATE INDEX "requests_provider_idx" ON "public"."requests" USING "btree" ("selected_user_id", "created_at" DESC);



CREATE INDEX "requests_requester_idx" ON "public"."requests" USING "btree" ("requester_id", "created_at" DESC);



CREATE INDEX "requests_source_request_idx" ON "public"."requests" USING "btree" ("source_request_id") WHERE ("source_request_id" IS NOT NULL);



CREATE INDEX "requests_status_posted_idx" ON "public"."requests" USING "btree" ("status") WHERE ("status" = 'posted'::"public"."request_status");



CREATE UNIQUE INDEX "service_problems_one_open_per_request" ON "public"."service_problems" USING "btree" ("request_id") WHERE ("status" = 'open'::"text");



CREATE INDEX "service_problems_respond_by_idx" ON "public"."service_problems" USING "btree" ("respond_by") WHERE (("status" = 'open'::"text") AND ("respond_by" IS NOT NULL));



CREATE INDEX "user_attendance_request_idx" ON "public"."user_attendance" USING "btree" ("request_id") WHERE ("request_id" IS NOT NULL);



CREATE INDEX "wallet_ledger_request_idx" ON "public"."wallet_ledger" USING "btree" ("request_id", "created_at");



CREATE INDEX "wallet_ledger_user_idx" ON "public"."wallet_ledger" USING "btree" ("user_id", "created_at");



