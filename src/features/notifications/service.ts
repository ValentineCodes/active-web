/**
 * Server-side notification service (Postgres).
 *
 * All business notifications must be created through the
 * `create_notification` RPC (SECURITY DEFINER, service_role only).
 * Clients cannot insert into `notification_inbox` (RLS: SELECT own rows only).
 *
 * Idempotency: pass a stable `p_event_key` per underlying event, e.g.
 * - `payment_transition:{payment_transition_id}`
 * - `response:{response_id}`
 * - `request:{request_id}:completion_pending`
 * - `cancel:{status_event_idempotency_key}:helper`
 * - `admin_dispute:{idempotency_key}:requester`
 * - Paystack webhook: `wallet_deposit:{external_reference}` (when wired)
 * - Withdraw: `withdraw:{idempotency_key}:processing|success`
 *
 * Not wired until product exists: `new_message`, `missed_call` (no server messaging/call events yet).
 *
 * Response bursts: `upsert_request_response_notification` keeps one inbox row per request
 * (dedupe `pending_responses:{requester}:{request}`), updating count/copy for `new_responses`.
 *
 * Dedupe key stored as `{type}:{recipient_user_id}:{event_key}`.
 * Retries return NULL and do not send duplicate pushes.
 *
 * Presentation (title/body/url) stays at the call site; the service only
 * persists and optionally delivers push via `deliver_expo_push`.
 */

export {};
