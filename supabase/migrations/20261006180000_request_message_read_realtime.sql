-- Deliver read_at updates to conversation subscribers (no "seen" UI yet; state for sync).

ALTER TABLE "public"."request_messages" REPLICA IDENTITY FULL;
