/**
 * Server-side notification service (Postgres).
 *
 * Persistent inbox rows are always created through `create_notification` (or response
 * upsert). Device push is optional and gated by `notification_type_should_push`.
 *
 * Push tokens: clients register via `push_tokens` (RLS: own rows only). The server
 * sends to every token on file for the recipient and prunes invalid Expo tokens.
 *
 * Transient actor feedback belongs in `src/lib/toast.ts`. Push opt-out is on profiles
 * (`push_notifications_enabled`, `message_push_enabled`); inbox rows are always created.
 *
 * Idempotency: pass a stable `p_event_key` per underlying event.
 *
 * Response bursts: `upsert_request_response_notification` keeps one inbox row per request
 * (dedupe `pending_responses:{requester}:{request}`), updating count/copy for `new_responses`.
 *
 * Enum types like `payment_secured`, `withdrawal_processing`, and `cancellation_confirmed`
 * remain for historical rows; new rows are not created for those self-confirming flows.
 */

export {};
