# Active Repository Audit (read-only baseline)

**Date:** 2026-11-19  
**Scope:** Verified implementation state vs product docs (`ACTIVE_PRODUCT_SPEC_V1.md` v1.0.3, roadmap, gaps register).  
**Constraint:** No application code, migrations, or tests were modified to produce this report.

Legend: **Verified** = observed in repository paths cited below. **Recommendation** = engineering judgment, not implemented.

---

## 1. Verified repository architecture

### Monorepo and tooling

| Item | Verified detail |
|------|-----------------|
| Layout | Root workspace with `apps/*` only — **no** `packages/` (`pnpm-workspace.yaml`) |
| Package manager | **pnpm** `11.24.0` (`package.json` `packageManager`) |
| Node linker | `hoisted` (Metro / NativeWind) |
| Root scripts | `pnpm validate`, `pnpm db:*`, `pnpm functions:test`, app filters (`package.json`) |
| Supabase CLI | `supabase/config.toml` — Postgres 17, local API 54321, seeds `supabase/seed.sql` |

### Applications

| App | Path | Stack (verified) |
|-----|------|------------------|
| Mobile | `apps/mobile` | Expo ~58, expo-router (`package.json` `@active/mobile`, `app/` routes) |
| PWA | `apps/pwa` | Vite/React (`apps/pwa/src/`, vitest `pnpm pwa:test`) |
| Admin | `apps/admin` | Next.js (`apps/admin/src/app/`) |
| Website | `apps/website` | Marketing (`package.json` scripts) |

Types: `apps/mobile/src/lib/supabase/database.types.ts` (and PWA copy) generated from local schema (`pnpm db:types`).

### Backend

| Layer | Verified detail |
|-------|-----------------|
| Migrations | **141** SQL files under `supabase/migrations/` |
| Edge Functions | **11** Deno entrypoints under `supabase/functions/` (Paystack, NIN, wallet withdraw, bank account) — **no** Request lifecycle functions |
| pgTAP | **26** tests in `supabase/tests/` (`pnpm db:test` → `supabase test db`) |
| CI/CD | **No** `.github/workflows` or other CI config found in repo root |
| Scheduled jobs | `pg_cron` extension installed (`20260930000100_extensions_and_types.sql`). **Verified:** engagement-cancellation cron was added (`20261015120000_engagement_cancellation_policy.sql`) then **removed** (`20261017100000_retire_engagement_cancellation.sql`). **No** `cron.schedule` for `auto_complete_due_requests` in migrations |

### Documentation in repo

- `supabase/docs/request-milestone-payments.md` — milestone RPC behaviour  
- `docs/product/*` — product spec, roadmap, gaps, unresolved (not re-verified line-by-line here)

---

## 2. Existing implementation inventory

### Request domain (core tables)

**Verified** in `20260930000300_tables_indexes_views.sql` and later migrations:

- `public.requests` — includes `expires_at`, `scheduled_for`, `accepted_at`, `started_at`, `completion_confirm_by`, `payment_status`, `agreed_provider_amount`, `payment_structure` (from `20261117180000_request_milestone_payments.sql`)
- `public.request_responses`, `public.handshakes`, `public.request_status_events`
- `public.request_conversations`, `public.request_messages` (Realtime)
- `public.service_problems`, `public.ratings`
- Milestone: `request_milestone_proposals`, `request_milestone_proposal_items`, `engagement_milestones`

**Legacy / retired (schema may remain):**

- `engagement_cancellation_requests`, `engagement_cancellation_events` — flows **retired** (`20261017100000_retire_engagement_cancellation.sql`, `20261017110000_drop_engagement_cancellation_functions.sql`); `cancel_service` raises error directing users to report/dispute

### Wallet domain

**Verified** `20261005120000_production_wallet_schema.sql` and followers:

- `wallets`, `wallet_transactions`, `payment_locks` (UNIQUE `request_id`), `deposit_transactions`
- `payment_locks.released_*_kobo` for milestone partial release (`20261117180000_request_milestone_payments.sql`)
- Authoritative mutations via `wallet_apply_entry` (`20261005130000_wallet_ledger_service.sql`) — **REVOKE** from `authenticated` in same migration family; client wallet balance **SELECT** only (`wallets_select_own` policy)

### Projects / Premium

**Verified missing** (grep across `supabase/migrations`, `database.types.ts`):

- No `projects`, `project_funding_pools`, `project_contributions`, `project_assignments`, `user_entitlements`, or `username` on `profiles`
- No Premium or Project RPCs in generated types

---

## 3. Existing vs missing (product-aligned)

| Product area | Repository state |
|--------------|------------------|
| Request create + browse/search | **Implemented** |
| Explicit calendar `expires_at` (decoupled from `scheduled_for`) | **Missing / wrong** — `create_request` uses `request_expires_at(p_scheduled_for)` (`20261117180100_request_milestone_rpcs.sql`) |
| Worker proposed delivery deadline | **Missing** — `respond_to_request` has no deadline args (`20260930000200_functions.sql`, latest overload in `20261009140000_request_edit_current_response_state.sql`) |
| 24h Start window + late reject | **Missing** — `start_request` accepts any time from `accepted` (`20261117180200_request_milestone_accept_and_workflow.sql`) |
| Failure-to-start / missed-delivery dismissal | **Missing** — no RPC; engagement cancel path retired |
| Universal Start UX | **Partial backend / no UI** — `start_request` exists; `useStartRequest` in mobile/PWA **not referenced by any screen** (only defined in `responses-api.ts`) |
| Milestone payments | **Implemented** (`20261117180000_*`, `20261117180200_*`, tests `request_milestone_payments.test.sql`) |
| Single-pay 72h auto-complete | **Implemented** (`auto_complete_request`, `completion_confirmation_interval`); **ops:** no in-repo scheduler for `auto_complete_due_requests` |
| Projects / funding pool / Premium | **Missing** |

---

## Audit A — Request lifecycle (verified trace)

### A.1 Creation and expiry

| Step | Frontend | Backend | DB / notes | Tests |
|------|----------|---------|------------|-------|
| Create | `apps/mobile/app/request/new.tsx`, `requester-api.ts` → `create_request` | `20261117180100_request_milestone_rpcs.sql` | `requests`, tags, optional milestones, `payment_structure` | `active.test.sql`, milestone tests |
| Expiry | UI “When do you need it?” sets `p_scheduled_for` (`request/new.tsx`) | `expires_at := request_expires_at(p_scheduled_for)` + 24h interval (`request_lifetime_interval` in `20260930000200_functions.sql`) | **Product mismatch** | Partial in `active.test.sql` |

### A.2 Response and counteroffer

| Step | Frontend | Backend |
|------|----------|---------|
| Respond | `apps/mobile/app/respond/[id].tsx`, `responses-api.ts` | `respond_to_request(p_request_id, p_message, p_quoted_amount, lat, lng)` — optional `quoted_amount` counteroffer |
| Milestone propose | Mobile/PWA milestone UI | `propose_milestone_plan_for_response`, items JSON RPCs (`20261117180700_*`, `20261117180400_*`) |

### A.3 Pre-accept chat

| Step | Frontend | Backend |
|------|----------|---------|
| Open chat | `conversation/[id].tsx`, `conversation-api.ts` | `open_pre_handshake_conversation`, `get_request_conversation`, message RPCs (`20261006140000_request_conversations.sql`, later attachment migrations) |
| Realtime | Supabase channel on `request_messages` | RLS participant policies |

### A.4 Acceptance and lock

| Step | Frontend | Backend |
|------|----------|---------|
| Accept | `requester-api.ts` → `accept_response` | `20261117180200_request_milestone_accept_and_workflow.sql` |
| Side effects | — | Sets `accepted_at`, `selected_user_id`, `status = accepted`; `lock_request_escrow_for_amount` / align (`20261009190000_lock_request_funding_on_accept.sql`); milestone `snapshot_engagement_milestones` |
| **Milestone auto-begin** | — | `20261117180800_milestone_engagement_auto_begin.sql` sets milestone **#1 `in_progress` at accept** (comment: “begin on accept”) — **conflicts with product universal Start + countdown at Start** |

### A.5 Start (current)

| Step | Frontend | Backend |
|------|----------|---------|
| Start work | **No UI hook** — `useStartRequest` unused | `start_request`: `accepted` → `in_progress`, `started_at = now()`, idempotent if already `in_progress` |
| Columns | — | **`accepted_at`, `started_at` already on `requests`** — reusable for 24h window and audit |

### A.6 Work, completion, payout

| Path | Worker action | Creator action | Backend |
|------|---------------|----------------|---------|
| Single | `mark_service_complete` (`responses-api.ts`) | `complete_request` (`requester-api.ts`) | Guards in `20261117180200_*`; payout via `finalize_request_completion` / wallet release pattern |
| Single auto | — | — | `auto_complete_request` / `auto_complete_due_requests` (`20260930000200_functions.sql`) — **service_role** only |
| Milestone | `submit_engagement_milestone`, approve flow in UI | `approve_engagement_milestone` | `wallet_release_milestone_kobo` partial release |
| **Gap** | `mark_service_complete` allows `status IN ('accepted','in_progress')` | — | Worker can mark single-pay complete **without** calling `start_request` |

### A.7 Dismissal, refunds, disputes

| Mechanism | State |
|-----------|--------|
| In-app engagement cancellation | **Retired** — `cancel_service` errors (`20261017100000_retire_engagement_cancellation.sql`) |
| Creator cancel pre-engagement | `cancel_request` → `finalize_request_cancellation` (service paths) |
| Disputes | `report_service_problem` / admin resolution (`service_problems`, admin RPCs) |
| Product-planned dismiss (failure to start / missed delivery) | **Absent** |

### A.8 Reviews

| Step | Frontend | Backend |
|------|----------|---------|
| Rate | `apps/mobile/app/rate/[id].tsx` | `rate_request` when `status = completed` (`20261001280000_bidirectional_request_ratings.sql`) |

### A.9 Engagement read model

- `get_engagement(p_request_id)` — `20261022161000_user_nin_submission.sql` returns `accepted_at`, `started_at`, status, payment, tags, counterparty — **does not expose `payment_structure`** in RETURNS TABLE (milestones loaded via `list_engagement_milestones` in clients)

---

## Audit B — Universal Start workflow

### Product requirements vs baseline

| Requirement | Baseline |
|-------------|----------|
| 24h window from `accepted_at` | **Not enforced** |
| Start all payment structures | RPC supports single + milestone (`start_request` in `20261117180200_*`) |
| Server-authoritative `started_at` | **Partial** — server sets `now()`; no window |
| Idempotent Start | **Yes** — early return if `in_progress` |
| Reject late Start | **No** |
| Countdown begins at Start | **No deadline fields** |
| Failure-to-start dismiss | **No RPC** |

### Safe reuse (verified)

- `requests.accepted_at`, `requests.started_at`
- `request_status_events` + `record_request_status_event` (idempotency keys e.g. `'start:' || request_id`)
- `start_request` grant to `authenticated`
- One-open-commitment index `requests_one_open_provider_commitment`

### Required changes (recommendations)

1. **Migration:** deadline/engagement columns (proposed, adjusted, timezone, start_deadline_at) — **none exist today**
2. **Modify `accept_response`:** no change to `accepted_at` semantics; optionally store proposed deadline when product fields exist
3. **Modify `start_request`:** enforce `now() <= accepted_at + interval '24 hours'`; compute adjusted deadline; set `in_progress` only on first Start
4. **Revert milestone auto-begin:** `20261117180800_*` sets milestone #1 `in_progress` at accept — **should align with Start** (otherwise milestones can be submitted while `requests.status = accepted` — **verified** `submit_engagement_milestone` only checks milestone status `in_progress`, not request `started_at`)
5. **New RPCs:** `dismiss_worker_failure_to_start`, `dismiss_worker_missed_delivery` (names per roadmap) with wallet refund via existing escrow patterns — **not** direct balance UPDATE
6. **Tighten `mark_service_complete`:** likely require `in_progress` + `started_at IS NOT NULL` (product decision) — today allows `accepted`

### Frontend gap

- `useStartRequest` in `apps/mobile/src/features/requests/responses-api.ts` and PWA mirror — **zero imports** from screens; engagement UI does not surface Start (`apps/mobile/app/engagement/[id].tsx` uses `accepted_at`/`started_at` for display only)

---

## Audit C — Delivery deadlines

| Requirement | Baseline |
|-------------|----------|
| Calendar proposal on respond | **No column, no RPC param** |
| Creator sees before accept | **No data to show** |
| Persistence / audit trail | **No tables/columns** |
| Adjust on Start | **No logic** |
| 30-day max from Start | **No logic** |
| Timezone | Request expiry uses `scheduled_for` + interval today; product wants `timestamptz` + `Africa/Lagos` — **partial precedent** in functions, not on delivery |
| Mutual extensions | **No RPC/history table** |
| Missed-delivery dismiss | **No RPC** |

### Race / stale-data risks (recommendations for design)

- **Late accept vs proposed deadline:** product docs note stale proposal risk; repository has **no** accept-time revalidation hook yet
- **Concurrent Start:** `start_request` uses `FOR UPDATE` on request — good base; deadline computation should happen in same transaction as first Start
- **Milestone payout before Start:** milestone #1 can be `in_progress` at accept — financial work could progress before product Start
- **Idempotent dismiss refunds:** must use `wallet_apply_entry` references + `payment_transitions` pattern like `finalize_request_cancellation` / `sync_wallet_payment_transition` (`20261005120100_production_wallet_functions.sql`)

---

## Audit D — Payment and refunds

### Verified financial lifecycle

1. **Fund at accept:** `lock_request_escrow_for_amount` → `wallet_lock_funds_kobo` → `payment_locks` active, requester wallet locked balance (`20261009190000_*`)
2. **Single payout:** release provider + fee via `wallet_apply_entry` types `escrow_release`, `payout`, `service_fee` (`20261005190000_service_fee_deducted_at_payout.sql`)
3. **Milestone payout:** `wallet_release_milestone_kobo` increments `released_*_kobo`, may set lock `released` when fully drained (`20261117180000_*`)
4. **Refunds:** `sync_wallet_payment_transition(..., to => refunded)` — **GRANT to `service_role` only** (`20260930000600_grants.sql`); cancellation uses `finalize_request_cancellation` (service_role)
5. **Disputes:** `payment_status = disputed` blocks auto-complete (`auto_complete_due_requests` query in `20260930000200_functions.sql`)
6. **Idempotency:** `wallet_transactions.reference` UNIQUE; transition idempotency keys on `payment_transitions`

### Product dismissal refunds (recommendation)

Failure-to-start and missed-delivery **can likely reuse**:

- `payment_locks` row for request (still `active` with full or partial `released_*` for milestones)
- `sync_wallet_payment_transition` or dedicated definer RPC calling `wallet_apply_entry` with `refund` / `escrow_partial_refund` types
- **Milestone Option B:** partial release already tracked on `payment_locks.released_*_kobo` — refund remainder to creator must respect released portions (**verified** guards in `wallet_release_milestone_kobo`)

**Do not** mutate `wallets.available_balance` directly — pattern in codebase is ledger-only.

### Integrity notes

- **Double refund:** prevented by reference keys if dismissal RPCs follow `wallet_apply_entry` idempotency
- **Dismiss + dispute:** **not defined** in code or product docs — implementation risk
- **Milestone + failure to start:** spec says 100% locked refund if no release before Start — consistent if milestone #1 auto-begin is reverted or releases blocked until Start

---

## Audit E — Projects

**Verified:** Entire Project/Premium surface from product docs is **absent** from database and apps (no entities, RPCs, or mobile routes under `project/`).

Placeholder-only items in UI:

- Roadmap mentions Projects tab stub in future Search (`ACTIVE_IMPLEMENTATION_ROADMAP.md`); PWA/mobile Search may not list Projects (verify at implementation time)

---

## Audit F — Security (verified patterns)

### RLS

- `requests`, `request_responses`: participant SELECT (`20260930000500_rls_and_realtime.sql`); mutations via RPCs, not broad UPDATE policies
- `profiles`: own row only SELECT/UPDATE
- `wallets`: own SELECT; **no** client INSERT on ledger
- Milestone tables: participant SELECT policies in `20261117180200_*`

### SECURITY DEFINER RPCs

- Request lifecycle RPCs (`create_request`, `accept_response`, `start_request`, etc.) use `assert_authenticated()` and row locks
- Wallet mutators (`wallet_apply_entry`, `sync_wallet_payment_transition`) — **service_role** or definer-only from trusted RPCs
- **Verified risk to fix in product work:** any new dismiss/refund RPC must **not** trust client-supplied amounts, deadlines, or timestamps — server must derive from stored engagement state

### Admin

- `admin_members` roles (`20261017120000_admin_members.sql`); dashboard uses server routes calling Supabase service role (`apps/admin/src/app/api/admin/*`)

### Public exposure

- `browse_open_requests` exposes limited requester fields (`20261104120000_*`)
- `get_engagement` exposes counterparty phone post-accept — by design in RPC

### Client trust flags

- Money amounts re-validated server-side on accept (`agreed_provider_amount`)
- Location: `assert_coordinates` on create
- **Timestamps:** `started_at` currently set server-side `now()` — good pattern to keep for Start

---

## Audit G — Frontend consistency

### Mobile screens (verified routes under `apps/mobile/app/`)

- Tabs: Home, Activity, Create, Notifications (`(tabs)/_layout.tsx`) — **not** product target nav
- Request: `request/new.tsx`, `request/[id].tsx`, `respond/[id].tsx`, `engagement/[id].tsx`, `rate/[id].tsx`
- Wallet, profile, conversation, search modal

### PWA (`apps/pwa/src/views/`)

- Parallels: `RequestNewPage`, `RespondPage`, `EngagementPage`, wallet flows, `HomeTabBar.tsx` (same four-tab pattern)
- Duplicated feature modules (no shared package): `features/requests/*` in both apps

### RPC usage

- Mobile/PWA call same RPC names via duplicated `*-api.ts` files
- React Query patterns for mutations; Realtime on conversation messages

### Gaps vs product

- **No Start button** wired despite hook
- **No delivery picker** on respond
- Milestone UI **implemented** (submit/approve sheets)

### Admin

- Requests, users, finance, withdrawals, reports, operational recovery (`admin_execute_operational_recovery` can run `auto_complete_request` — `20261017170000_admin_operations.sql`)

---

## Audit H — Testing and operations

### Existing tests

| Suite | Path | Coverage focus |
|-------|------|----------------|
| pgTAP | `supabase/tests/*.sql` (26 files) | Requests, wallet funding/settlement, milestones, admin, withdrawals, pre-handshake chat, completion proof |
| Mobile unit | `apps/mobile/package.json` scripts | milestones, completion-proof, chat eligibility, withdraw flows |
| PWA | `pnpm pwa:test` | vitest in PWA package |
| Edge | `pnpm functions:test` | Paystack/NIN/deposit shared modules only |

### Gaps for revised lifecycle (recommendation)

- pgTAP: 24h Start boundary; idempotent Start; dismiss failure-to-start full lock refund; deadline shift math; 30-day cap from Start; milestone Option B on missed dismiss; no complete while `accepted` without Start (if enforced)
- Mobile: Start CTA, countdown, dismiss flows
- Regression: milestone submit blocked until Start if auto-begin reverted
- Ops: document **who calls** `auto_complete_due_requests` (currently **only** `service_role` grant — no in-repo cron)

---

## 5. Database and RPC inventory (change-relevant)

### Tables to extend or add (recommendation)

| Target | Action |
|--------|--------|
| `requests` | Add delivery deadline fields, optional `start_deadline_at` |
| New history table | Extension consent, dismissal events (product audit trail) |
| Projects | All new (per roadmap phases 4–8) |

### RPCs to modify (verified exist)

- `create_request`, `respond_to_request`, `accept_response`, `start_request`, `mark_service_complete`, `complete_request`, `auto_complete_request`

### RPCs to add (recommendation, names from product roadmap)

- `dismiss_worker_failure_to_start`, `dismiss_worker_missed_delivery`, `agree_delivery_extension`

### RPCs present — wallet / money

- `wallet_apply_entry`, `wallet_lock_funds_kobo`, `wallet_release_milestone_kobo`, `lock_request_escrow_for_amount`, `align_request_escrow_to_agreed_amount`, `finalize_request_cancellation`, `sync_wallet_payment_transition`, `get_my_wallet`, `compute_request_charge`

---

## 6. Security findings (summary)

| Severity | Finding |
|----------|---------|
| **Low (good)** | Wallet balances not client-writable; escrow via definer RPCs |
| **Medium** | New dismiss RPCs must be definer-only, amount derived from `payment_locks`, dispute state checked explicitly (undefined today) |
| **Medium** | `respond_to_request` granted to `anon` in old grants file — verify current effective grants on latest overload (recommend auditing `GRANT` on latest migration) |
| **Ops** | No automated auto-complete in repo — production dependency unknown |

---

## 7. Financial integrity findings (summary)

| Topic | Assessment |
|-------|------------|
| Failure-to-start full refund | **Feasible** via existing lock + refund transition pattern |
| Missed-delivery partial (milestones) | **Feasible** via `released_*_kobo` remainder |
| No fee on dismissal refunds | Align with `sync_wallet_payment_transition` refund paths (no service_fee line on refund) |
| Direct balance mutation | **Not used** in current patterns — maintain ledger discipline |

---

## 8. Migration risks

1. **Milestone auto-begin (`20261117180800_*`):** changing behaviour affects in-flight engagements; backfill/data migration may be needed for milestone #1 status vs `requests.status`
2. **`payment_locks` UNIQUE `request_id`:** dismiss/refund must update same row (relock pattern in `20261015133000_payment_lock_relock_after_refund.sql`)
3. **Tightening `mark_service_complete`:** may break clients that never call `start_request` today
4. **Adding NOT NULL deadline columns:** require defaults or multi-phase deploy for open engagements
5. **141-migration history:** new migrations must follow existing naming and grant patterns

---

## 9. Recommended implementation sequence (aligned with repo reality)

**Recommendation** — matches `ACTIVE_IMPLEMENTATION_ROADMAP.md` but ordered by **verified gaps**:

1. **Phase 0** — Fix `create_request` expiry (`expires_at` explicit); mobile/PWA create UX (`request/new.tsx`, PWA `RequestNewPage.tsx`)
2. **Phase 0a** — `start_request` 24h rule; failure-to-start dismiss + refund RPC; **revert or gate** milestone auto-begin; wire **Start UI** (replace dead `useStartRequest`); tighten single-pay complete to require Start (product-approved)
3. **Phase 0b** — Respond/accept deadline columns; adjust on Start; missed-delivery dismiss; extensions
4. **Phases 1–4** — Identity, nav, Crown, Premium schema (greenfield)
5. **Phases 5–8** — Projects (greenfield)
6. **Ops** — Schedule or runbook `auto_complete_due_requests`

---

## 10. Dependencies and blockers

| Blocker | Source | Affects |
|---------|--------|---------|
| Stale proposed deadline at accept | Product spec gap (audit noted) | Phase 0b server rules |
| UD-21 qualifying deliverable | `ACTIVE_UNRESOLVED_DECISIONS.md` | Missed-delivery dismiss |
| UD-19 pool accounting | Unresolved | Project Phase 6 refunds |
| UD-01 Project visibility | Unresolved | Project discovery |
| No CI in repo | OV-02 | Regression safety |
| No auto-complete scheduler | OV-01 | Single-pay 72h rule in production |

---

## Appendix — Key file index

| Area | Paths |
|------|-------|
| Request RPCs (latest milestone) | `supabase/migrations/20261117180100_request_milestone_rpcs.sql`, `20261117180200_request_milestone_accept_and_workflow.sql`, `20261117180800_milestone_engagement_auto_begin.sql` |
| Wallet | `supabase/migrations/20261005120000_production_wallet_schema.sql`, `20261005130000_wallet_ledger_service.sql`, `20261009190000_lock_request_funding_on_accept.sql` |
| Mobile APIs | `apps/mobile/src/features/requests/requester-api.ts`, `responses-api.ts`, `milestone-api.ts` |
| Engagement UI | `apps/mobile/app/engagement/[id].tsx`, `apps/pwa/src/views/EngagementPage.tsx` |
| Tests | `supabase/tests/active.test.sql`, `wallet_request_settlement.test.sql`, `request_milestone_payments.test.sql` |

---

*End of repository audit. Facts are tied to paths above; recommendations are implementation guidance only.*