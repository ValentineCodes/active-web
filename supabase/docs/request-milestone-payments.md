# Request milestone payments — backend implementation report

Phase: **Supabase only** (no native/PWA UI). Default `single`; optional `milestone` (2–5 items, sum = agreed offer).

## Migrations

| Migration | Purpose |
| --- | --- |
| `20261117180000_request_milestone_payments.sql` | Enums, tables, `payment_locks` partial-release columns, `wallet_release_milestone_kobo`, `sync_wallet_payment_transition` / `wallet_lock_funds_kobo` updates |
| `20261117180100_request_milestone_rpcs.sql` | Snapshot/validation helpers, `create_request` (optional milestones), negotiation RPCs, `finalize_milestone_engagement` |
| `20261117180200_request_milestone_accept_and_workflow.sql` | `accept_response` milestone branch, work RPCs, single-payment guards, RLS, read RPCs |
| `20261117180300_create_request_single_overload.sql` | Drop legacy 10-arg `create_request` overload (fixes ambiguity) |

## Schema

### Enums

- `payment_structure`: `single` \| `milestone` (`requests.payment_structure`, default `single`)
- `milestone_status`: `pending` → `in_progress` → `submitted` ↔ `revision_requested` → `approved_paid`
- `milestone_proposal_status`: `draft` \| `proposed` \| `requester_agreed` \| `locked` \| `superseded`

### Tables

- **`request_milestone_proposals`** — pre-accept plans (`response_id` NULL = requester draft; non-NULL = responder proposal)
- **`request_milestone_proposal_items`** — title, description, `amount_major`, `position` (1–5)
- **`engagement_milestones`** — frozen at accept: kobo splits (`total_kobo`, `provider_kobo`, `fee_kobo`), status, submission/approval metadata, `payout_reference` (idempotency)

### `payment_locks` (extended)

- `released_total_kobo`, `released_provider_kobo`, `released_fee_kobo` (cumulative partial releases)
- Lock stays `active` until `released_total_kobo = total`, then `status = released`

## RPCs (authenticated unless noted)

| RPC | Role |
| --- | --- |
| `create_request(..., p_payment_structure default 'single', p_milestones default null)` | Post; milestone plan when structure = milestone |
| `set_request_milestone_draft(request_id, milestones jsonb)` | Requester edit draft (pre-accept) |
| `submit_response_milestone_proposal(response_id, milestones jsonb)` | Responder counter-plan |
| `agree_to_response_milestone_proposal(response_id)` | Legacy; choosing a helper accepts `proposed` plans via `accept_response` |
| `accept_response(response_id)` | **Updated** — validates plan, locks full offer, `snapshot_engagement_milestones` |
| `start_request(request_id)` | **Updated** — milestone #1 → `in_progress` |
| `submit_engagement_milestone(milestone_id)` | Helper submit / resubmit after revision |
| `request_engagement_milestone_revision(milestone_id)` | Requester revision (no payout) |
| `approve_engagement_milestone(milestone_id)` | Requester payout slice + advance / complete |
| `list_engagement_milestones(request_id)` | Read milestones |
| `list_request_milestone_proposals(request_id)` | Requester read proposals |
| `mark_service_complete` / `complete_request` / `auto_complete_request` | **Guarded** — reject milestone engagements |

**service_role (internal):** `wallet_release_milestone_kobo`, `snapshot_engagement_milestones`, `finalize_milestone_engagement`, `validate_proposal_matches_total`, `replace_milestone_proposal_items`, `parse_milestone_items_json`, `milestone_items_sum_matches_total`, `resolve_milestone_proposal_for_accept`, `sync_wallet_payment_transition`, `wallet_lock_funds_kobo`

## Financial flow

1. **Accept:** unchanged lock — `lock_request_escrow_for_amount(agreed_total)`; full offer in one `payment_locks` row.
2. **Approve milestone *n*:** `wallet_release_milestone_kobo` — `escrow_release` (locked delta = milestone total), `payout` (provider net), `service_fee` (10% slice via `compute_request_charge` per milestone `amount_major`).
3. **Final milestone:** `finalize_milestone_engagement` → request `completed`, `apply_payment_transition(pending → released)` with **no second full release** when lock already fully released (milestone-aware `sync_wallet_payment_transition`).

### Invariants

- Sum of proposal / engagement milestone **major** amounts = `agreed_provider_amount` at accept.
- Sum of `engagement_milestones.total_kobo` = lock `total`.
- `released_*_kobo` on lock never exceeds original lock components.
- Payout idempotency: `milestone:{id}` reference prefix; duplicate approve is no-op.
- No client-supplied amounts on approve (reads frozen `engagement_milestones` row only).
- Post-accept: proposals → `locked` / `superseded`; engagement rows immutable amounts.

## Triggers

- `milestone_touch_updated_at` on proposal / item / engagement milestone tables (existing request triggers unchanged).

## RLS

- **SELECT** on proposal tables and `engagement_milestones` for requester and responder/selected helper only.
- No INSERT/UPDATE/DELETE for `authenticated` (mutations via SECURITY DEFINER RPCs only).

## Disputes

- Existing `report_service_problem` → `payment_status = disputed`.
- Milestone work RPCs reject disputed request/payment (no automatic release).

## Backward compatibility

- Existing rows: `payment_structure = single` by default.
- Legacy `create_request(...)` 7–10 arg calls work via defaulted trailing parameters.
- Single-payment completion path untouched when `payment_structure = single`.

## Tests

- **`supabase/tests/request_milestone_payments.test.sql`** — validation, accept lock, sequential submit/approve, revision, partial release, fee, idempotency, unauthorized approve, guards, insufficient wallet.
- **`supabase/tests/wallet_request_funding.test.sql`** — regression **PASS**.

Run:

```bash
supabase db reset
supabase test db supabase/tests/request_milestone_payments.test.sql supabase/tests/wallet_request_funding.test.sql
```

## Rollout

1. Apply migrations on staging; run pgTAP suite above + spot-check single-payment E2E.
2. Regenerate client types: `pnpm db:types` (and sync `apps/pwa` types).
3. Deploy RPCs before enabling UI (`payment_structure` + milestone JSON on `create_request`).
4. Monitor: `payment_locks.released_*`, milestone payout references, admin finance (incremental releases).

## Client follow-up (out of scope here)

- Create/respond/accept UI, engagement milestone timeline, wallet copy for partial escrow.
- Call new RPCs; **do not** call `mark_service_complete` / `complete_request` for milestone jobs.