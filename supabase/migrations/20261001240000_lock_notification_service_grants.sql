-- Replacing notification service functions resets default EXECUTE grants.
-- Lock server-only entry points to service_role (triggers/RPCs run as SECURITY DEFINER owner).

REVOKE ALL ON FUNCTION "public"."create_notification"(
  "p_recipient_user_id" "uuid",
  "p_event_key" "text",
  "p_type" "public"."notification_type",
  "p_title" "text",
  "p_body" "text",
  "p_url" "text",
  "p_request_id" "uuid",
  "p_response_id" "uuid",
  "p_payment_transition_id" "uuid",
  "p_wallet_ledger_id" "uuid",
  "p_related_user_id" "uuid",
  "p_metadata" "jsonb",
  "p_deliver_push" boolean
) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."create_notification"(
  "p_recipient_user_id" "uuid",
  "p_event_key" "text",
  "p_type" "public"."notification_type",
  "p_title" "text",
  "p_body" "text",
  "p_url" "text",
  "p_request_id" "uuid",
  "p_response_id" "uuid",
  "p_payment_transition_id" "uuid",
  "p_wallet_ledger_id" "uuid",
  "p_related_user_id" "uuid",
  "p_metadata" "jsonb",
  "p_deliver_push" boolean
) TO "service_role";

REVOKE ALL ON FUNCTION "public"."deliver_expo_push"(
  "p_recipient_user_id" "uuid",
  "p_title" "text",
  "p_body" "text",
  "p_url" "text",
  "p_type" "public"."notification_type",
  "p_request_id" "uuid",
  "p_response_id" "uuid",
  "p_payment_transition_id" "uuid",
  "p_wallet_ledger_id" "uuid",
  "p_related_user_id" "uuid"
) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."deliver_expo_push"(
  "p_recipient_user_id" "uuid",
  "p_title" "text",
  "p_body" "text",
  "p_url" "text",
  "p_type" "public"."notification_type",
  "p_request_id" "uuid",
  "p_response_id" "uuid",
  "p_payment_transition_id" "uuid",
  "p_wallet_ledger_id" "uuid",
  "p_related_user_id" "uuid"
) TO "service_role";

REVOKE ALL ON FUNCTION "public"."upsert_request_response_notification"(
  "p_requester_id" "uuid",
  "p_request_id" "uuid",
  "p_latest_response_id" "uuid",
  "p_latest_responder_id" "uuid",
  "p_pending_count" integer
) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."upsert_request_response_notification"(
  "p_requester_id" "uuid",
  "p_request_id" "uuid",
  "p_latest_response_id" "uuid",
  "p_latest_responder_id" "uuid",
  "p_pending_count" integer
) TO "service_role";

REVOKE ALL ON FUNCTION "public"."prune_invalid_expo_push_tokens"(
  "p_tokens" "text"[],
  "p_response" "jsonb"
) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."prune_invalid_expo_push_tokens"(
  "p_tokens" "text"[],
  "p_response" "jsonb"
) TO "service_role";

DROP FUNCTION IF EXISTS "public"."send_push"("p_user_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_url" "text");
