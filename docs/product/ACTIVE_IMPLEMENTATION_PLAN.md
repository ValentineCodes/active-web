# Active Implementation Plan (pre-implementation gate)

**Status:** Planning only — no application code changes until explicit approval.  
**Sources:** `ACTIVE_PRODUCT_SPEC_V1.md` (v1.0.3), `ACTIVE_IMPLEMENTATION_ROADMAP.md` (v1.0.3), `ACTIVE_EXISTING_VS_PLANNED.md`, `ACTIVE_UNRESOLVED_DECISIONS.md`, `ACTIVE_REPOSITORY_AUDIT.md`.  
**Date:** 2026-11-19

This plan translates product decisions into **repository-aware**, **independently verifiable** phases. It is **not** a copy of the product roadmap: sequencing follows verified dependencies (e.g. `start_request` exists but unused; milestone #1 auto-begins on accept; no dismiss RPCs; no Projects schema).

### Technical constraints (from spec + audit)

- Wallet: `wallet_apply_entry`, integer **kobo**, no client balance authority.
- Financial ops: transactional, idempotent, definer RPCs; no direct `wallets` UPDATE from clients.
- Timestamps: server-authoritative (`accepted_at`, `started_at`, deadlines).
- RLS: do not widen `profiles` or `wallets` for convenience; keep mutations in RPCs.
- Migrations: preserve in-flight engagements; backward-compatible defaults where columns are added.
- Clients: mobile leads; PWA incremental; duplicate `features/` until a shared package is explicitly approved (currently **no** `packages/`).

### Workstream map

| ID | Workstream | Plan phases |
|----|------------|-------------|
| WS1 | Database and backend foundations | IP-0 |
| WS2 | Request lifecycle and universal Start | IP-1, IP-2 |
| WS3 | Delivery deadlines and extensions | IP-3 |
| WS4 | Dismissal and financial consequences | IP-2 (failure-to-start), IP-4 (missed-delivery) |
| WS5 | Project funding foundations | IP-10 |
| WS6 | Contributions and reservations | IP-11 |
| WS7 | Project assignments and independent commencement | IP-12 |
| WS8 | Deliverables, milestones, approvals, payouts | IP-13 |
| WS9 | Premium entitlement integration | IP-9 |
| WS10 | Mobile implementation | Cross-cutting per phase (primary UI) |
| WS11 | PWA implementation | Cross-cutting per phase (after mobile gate) |
| WS12 | Admin and moderation | IP-14 (incremental with features) |
| WS13 | Notifications and realtime | Cross-cutting |
| WS14 | Testing, deployment, operational verification | IP-0, every phase exit gate |

---

## Phase IP-0 — Engineering and operational foundations

**Workstreams:** WS1, WS14

| Field | Detail |
|-------|--------|
| **Objective** | Repeatable validation, types, and ops hooks before lifecycle changes ship. |
| **Scope** | Document/local CI pattern, `pnpm db:types` workflow, auto-complete runbook stub, migration checklist. |
| **Non-goals** | Feature RPCs; production deploy automation. |
| **Dependencies** | None. |
| **Inspect** | `package.json`, `supabase/config.toml`, `supabase/tests/`, `ACTIVE_REPOSITORY_AUDIT.md` §H |
| **Likely changes** | `docs/` runbook only (optional); **no product requirement** to add `.github/workflows` in this phase (OV-02). |
| **Migrations** | None. |
| **RPCs / Edge** | None. |
| **RLS** | None. |
| **Mobile/PWA/Admin** | None. |
| **Tests** | Baseline: `pnpm db:test`, `pnpm validate`, `pnpm functions:test`, `pnpm --filter @active/mobile test:milestones`. |
| **Acceptance** | Team can reset DB, run pgTAP, regenerate `database.types.ts` for mobile + PWA. |
| **Rollback** | N/A. |
| **Verification** | `pnpm db:reset && pnpm db:test && pnpm db:types`; copy types to `apps/pwa/src/lib/supabase/database.types.ts` if not automated. |

**Assumption (non-blocking):** CI lives outside repo (OV-02) until explicitly added.

---

## Phase IP-1 — Request expiry (absolute `expires_at`)

**Workstreams:** WS2 (partial), WS10, WS11, WS14

| Field | Detail |
|-------|--------|
| **Objective** | Align creation with spec: “When does it expire?” — absolute `timestamptz`, decoupled from `scheduled_for`. |
| **Scope** | `create_request` (+ overloads), mobile/PWA create UX, pgTAP for timezone boundaries. |
| **Non-goals** | Request expiry extension policy (UD-17); optional `scheduled_for` UX (UD-16). |
| **Dependencies** | IP-0. |
| **Inspect** | `supabase/migrations/20261117180100_request_milestone_rpcs.sql`, `20260930000200_functions.sql` (`request_expires_at`, `request_lifetime_interval`); `apps/mobile/app/request/new.tsx`, `apps/pwa/src/views/RequestNewPage.tsx`; `apps/mobile/src/features/requests/requester-api.ts` |
| **Likely changes** | New migration replacing/overloading `create_request`; mobile/PWA picker copy and params; tests in `supabase/tests/active.test.sql` or new file. |
| **Migrations** | Add explicit `p_expires_at` or timezone helper; stop sole dependency on `scheduled_for + 24h`. |
| **RPCs** | **MOD** `create_request`. |
| **RLS** | None expected. |
| **Mobile** | **MOD** `request/new.tsx`, `requester-api.ts`. |
| **PWA** | **MOD** `RequestNewPage.tsx`, wizard. |
| **Admin** | None. |
| **Tests** | pgTAP: Today/Future, 11:59 PM `Africa/Lagos`, future-only time adjustment. |
| **Acceptance** | New Requests store `expires_at` independent of `scheduled_for`; browse/search gates unchanged (`expires_at > now()`). |
| **Rollback** | Feature flag or dual-path RPC only if needed; prefer single authoritative path after deploy. |
| **Verification** | `pnpm db:test`; manual create on mobile. |

---

## Phase IP-2 — Universal Start, milestone alignment, failure-to-start dismissal

**Workstreams:** WS2, WS4 (failure-to-start), WS10, WS11, WS13, WS14

| Field | Detail |
|-------|--------|
| **Objective** | Enforce 24h Start from `accepted_at`; idempotent `started_at`; wire Start UI; failure-to-start dismiss with full lock refund; fix milestone #1 beginning only after Start. |
| **Scope** | `start_request`, `accept_response` (if needed), **revert/gate** `20261117180800_milestone_engagement_auto_begin.sql` behaviour; `dismiss_worker_failure_to_start`; `mark_service_complete` guard (require `in_progress` + `started_at` per spec); notifications. |
| **Non-goals** | Delivery deadline fields (IP-3); missed-delivery dismiss (IP-4). |
| **Dependencies** | IP-0. **Parallel** with IP-1. **Blocks** IP-3 and IP-4 completion. |
| **Inspect** | `20261117180200_request_milestone_accept_and_workflow.sql` (`start_request`, `accept_response`, `mark_service_complete`); `20261117180800_milestone_engagement_auto_begin.sql`; `20261005130000_wallet_ledger_service.sql`, `sync_wallet_payment_transition`; `apps/mobile/src/features/requests/responses-api.ts` (`useStartRequest` unused); `apps/mobile/app/engagement/[id].tsx`, `apps/pwa/src/views/EngagementPage.tsx` |
| **Likely changes** | New migration(s); mobile/PWA engagement Start CTA + countdown; creator dismiss after window; `get_engagement` if new fields needed later (optional this phase). |
| **Migrations** | Optional: `start_deadline_at` generated column or computed in RPC; audit rows in `request_status_events`. |
| **RPCs** | **MOD** `start_request`; **NEW** `dismiss_worker_failure_to_start`; **MOD** `mark_service_complete` (and milestone submit if must require request `in_progress`). |
| **RLS** | Unchanged; dismiss/start via definer RPCs only. |
| **Mobile** | **MOD** `engagement/[id].tsx`; wire `useStartRequest`; requester dismiss UI. |
| **PWA** | Same pattern in `EngagementPage.tsx`. |
| **Admin** | Read-only visibility via existing request detail (`apps/admin/.../requests/[id]/page.tsx`). |
| **Tests** | pgTAP: 24h boundary; idempotent Start; late Start rejected; dismiss refunds 100% locked (single + milestone, no pre-Start release); milestone #1 not `in_progress` until Start. |
| **Acceptance** | All payment structures require Worker Start; creator can dismiss after 24h without Start; refunds idempotent, no service fee; existing `accepted_at` reused. |
| **Rollback** | Migration to relax 24h gate (emergency only); avoid resetting `started_at` on clients. |
| **Verification** | `pnpm db:test`; `pnpm --filter @active/mobile test:milestones`; manual accept → Start / dismiss paths. |

**Repository note:** Today `useStartRequest` is dead code; milestone #1 is `in_progress` on accept — **must** change for spec compliance.

---

## Phase IP-3 — Calendar delivery deadlines and mutual extensions

**Workstreams:** WS3, WS10, WS11, WS14

| Field | Detail |
|-------|--------|
| **Objective** | “When will you deliver?” on respond; creator sees proposal before accept; adjust deadline on Start; 30-day max from Start; extension RPC with audit trail. |
| **Scope** | `respond_to_request`, `accept_response`, **MOD** `start_request` (shift math + validation); `agree_delivery_extension`; extend `get_engagement` / list RPCs for display. |
| **Non-goals** | Missed-delivery dismiss (IP-4 until UD-21 or interim scope). |
| **Dependencies** | **IP-2** (required). |
| **Inspect** | Latest `respond_to_request` in `20261009140000_request_edit_current_response_state.sql`; accept flow in `20261117180200_*` |
| **Likely changes** | New columns on `requests` or `request_responses` / handshake table for proposed + adjusted deadlines, timezone; mobile `respond/[id].tsx`, accept preview UI. |
| **Migrations** | Add deadline + timezone columns; optional `request_engagement_terms` history table for extensions. |
| **RPCs** | **MOD** `respond_to_request`, `accept_response`, `start_request`; **NEW** `agree_delivery_extension`. |
| **RLS** | Participant read via existing patterns; writes only in RPCs. |
| **Mobile/PWA** | Date/time picker on respond; deadline display on accept/engagement. |
| **Tests** | pgTAP: spec example shift (Fri 5pm → Sat 3pm); 30-day cap from Start; extension mutual consent; no countdown before Start. |
| **Acceptance** | Adjusted deadline stored with audit fields; extensions before current deadline; server rejects invalid dates. |
| **Rollback** | Nullable columns for open engagements; dismiss feature not required for rollback of deadline display. |
| **Verification** | `pnpm db:test`; mobile respond/accept/Start flow. |

**Blocker — product:** Stale proposed deadline when creator accepts long after respond (documented in consistency audit; **not** in unresolved register). **Do not implement accept validation** until product approves rule (reject / re-propose / recompute). **Phase IP-3 can ship read/write of proposal with IP-2 Start validation only after decision.**

---

## Phase IP-4 — Missed-delivery dismissal and refunds

**Workstreams:** WS4, WS12, WS13, WS14

| Field | Detail |
|-------|--------|
| **Objective** | Creator dismiss after adjusted deadline if no qualifying deliverable; single-pay remaining lock refund; milestone Option B. |
| **Scope** | `dismiss_worker_missed_delivery`; wallet remainder refund using `payment_locks.released_*_kobo`; engagement termination state; dispute interaction rules. |
| **Non-goals** | Changing milestone approval rules; auto-complete changes. |
| **Dependencies** | IP-2, IP-3. |
| **Inspect** | `wallet_release_milestone_kobo` in `20261117180000_*`; `payment_locks`; `submit_engagement_milestone`, `mark_service_complete`, completion proof tests `supabase/tests/completion_proof.test.sql` |
| **Likely changes** | New dismiss RPC; optional admin report filter; notifications. |
| **Migrations** | Dismissal events (status or history table); no duplicate `payment_locks` per request. |
| **RPCs** | **NEW** `dismiss_worker_missed_delivery`; may **MOD** status transitions. |
| **RLS** | Definer only. |
| **Mobile/PWA** | Creator dismiss CTA when eligible; Worker messaging. |
| **Admin** | Optional dismiss list on request detail. |
| **Tests** | pgTAP: no dismiss before deadline; Option B partial release; idempotent refund; interaction with `payment_status = disputed` (**define in UD or new decision**). |
| **Acceptance** | Refunds match spec §3.12; no 10% fee on refund; no reversal of released milestones. |
| **Rollback** | Disable RPC via permission flag (prefer not to delete). |
| **Verification** | `pnpm db:test`; financial cases in `wallet_request_settlement.test.sql` patterns. |

**Blocker:** **UD-21** — qualifying deliverable definition. **Interim scope allowed:** ship IP-2 + IP-3 without IP-4 dismiss button; or admin-only dismiss until UD-21 closed.

---

## Phase IP-5 — Identity, profiles, and People search

**Workstreams:** WS1, WS10, WS11 (partial), WS14 — maps product **Phase 1**

| Field | Detail |
|-------|--------|
| **Objective** | Usernames and public profile RPCs without widening `profiles` SELECT. |
| **Scope** | `profiles.username`, `set_username`, `get_public_profile`, `search_people`. |
| **Non-goals** | Crown UI; Projects tab. |
| **Dependencies** | IP-0. **Parallel** with IP-1–IP-4. |
| **Inspect** | `20260930000500_rls_and_realtime.sql`; `guard_profile_columns`; `PersonProfileBottomSheet.tsx` |
| **Migrations** | Username column + indexes; definer RPCs. |
| **RPCs** | **NEW** as roadmap. |
| **RLS** | **No** public `profiles` SELECT; allowlist in RPC. |
| **Mobile** | `profile/edit.tsx`, new public route. |
| **PWA** | Incremental after mobile. |
| **Tests** | pgTAP uniqueness, RLS denial. |
| **Acceptance** | Per roadmap Phase 1. |
| **Rollback** | Drop username column only if no production users (pre-GA). |
| **Verification** | `pnpm db:test`; `pnpm validate`. |

---

## Phase IP-6 — Search, navigation, and profile activity shell

**Workstreams:** WS10, WS11 — product **Phase 2** (partial **Phase 9**)

| Field | Detail |
|-------|--------|
| **Objective** | Search tab; decouple Home from `q=`; move Activity toward profile. |
| **Scope** | `(tabs)/_layout.tsx`, `search.tsx`, Home index; PWA `HomeTabBar.tsx`. |
| **Non-goals** | Projects search; Top tab ranking (UD-11). |
| **Dependencies** | IP-5 for People tab. |
| **Inspect** | `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/app/search.tsx`, `apps/pwa/src/components/navigation/HomeTabBar.tsx` |
| **Migrations** | Optional `pg_trgm` on username (if approved). |
| **RPCs** | Wire `search_people`; reuse `search_requests`. |
| **RLS** | Unchanged. |
| **Tests** | Mobile query tests; SQL limits. |
| **Acceptance** | Home feed not mutated by Search. |
| **Rollback** | Revert tab layout. |
| **Verification** | `pnpm validate`; manual nav. |

**Assumption (non-blocking):** Notifications in header (UD-12 interim).

---

## Phase IP-7 — Unified reputation (Crown) schema and admin adjust

**Workstreams:** WS1, WS12 — product **Phase 3**

| Field | Detail |
|-------|--------|
| **Objective** | Ledger, tiers, admin adjust; **optional** manual deltas before UD-08. |
| **Non-goals** | Automated point hooks (blocked UD-08–10). |
| **Dependencies** | IP-5 recommended. |
| **Migrations** | `user_reputation`, `reputation_ledger`, config. |
| **RPCs** | `apply_reputation_delta` (admin/service), reads for self. |
| **Tests** | Shield order; ledger append-only. |
| **Acceptance** | Client cannot set points. |
| **Verification** | `pnpm db:test`; admin UI. |

---

## Phase IP-8 — Request engagement hardening (post-IP-4)

**Workstreams:** WS2, WS14 — **optional consolidation phase**

| Field | Detail |
|-------|--------|
| **Objective** | Close gaps: `get_engagement` includes `payment_structure` + deadlines; dismiss vs dispute vs `completion_pending`; deny double paths. |
| **Scope** | RPC harmonization; documentation in `supabase/docs/`. |
| **Non-goals** | New product features. |
| **Dependencies** | IP-4. |
| **Inspect** | `get_engagement` in `20261022161000_user_nin_submission.sql`; audit §A.7 |
| **Tests** | Regression pgTAP for auto-complete + dismiss mutual exclusion. |
| **Acceptance** | No dismiss after timely `mark_service_complete`; disputed blocks payout. |

**Blocker for full rules:** Dismiss vs dispute matrix — **requires product approval** (consistency audit PO-3).

---

## Phase IP-9 — Premium entitlement (trial)

**Workstreams:** WS9, WS1, WS10, WS12

**Product Phase 4**

| Field | Detail |
|-------|--------|
| **Objective** | `user_entitlements`, 30-day trial without card, gate **Project create** only. |
| **Non-goals** | Paid Premium (UD-13); Crown linkage. |
| **Dependencies** | IP-0. **Blocks** IP-10. |
| **Migrations** | Entitlements table + RPCs `start_premium_trial`, `assert_project_creator_premium`. |
| **Mobile** | Trial UX; gate Project composer when IP-10 ships. |
| **Tests** | One trial per account (UD-14 assumption: `user_id` only until hardened). |
| **Acceptance** | Requests unchanged; existing Projects operable after expiry (once Projects exist). |
| **Verification** | `pnpm db:test`. |

---

## Phase IP-10 — Project foundation (create, visibility fields)

**Workstreams:** WS5, WS1, WS10, WS12 — product **Phase 5**

| Field | Detail |
|-------|--------|
| **Objective** | `projects` entity separate from `requests`; budget fields; funding deadline; funding visibility; creator-controlled visibility **field** (modes TBD). |
| **Non-goals** | Assignments; contributions. |
| **Dependencies** | **IP-9**; **UD-01** for discovery/indexing behaviour. |
| **Migrations** | `projects`, tags, enums; **no** `payment_locks.request_id` overload. |
| **RPCs** | `create_project`, `update_project`, `get_project`. |
| **RLS** | Restrictive; access via definer RPCs (exact matrix waits UD-01). |
| **Tests** | Premium gate; deadline 1–30d validation. |
| **Acceptance** | No Project rows in `requests`. |
| **Rollback** | Feature flag on create RPC. |

**Blocker:** **UD-01** — visibility modes and who can view/index. **Can implement create + owner read** in interim without public discovery.

---

## Phase IP-11 — Contributions and shared pool

**Workstreams:** WS6, WS14 — product **Phase 6**

| Field | Detail |
|-------|--------|
| **Objective** | Pool, contribute, invite modes, lazy Funding Unsuccessful, contributor balance **schema**. |
| **Non-goals** | Refund RPC correctness until UD-19. |
| **Dependencies** | IP-10. |
| **Inspect** | `wallet_apply_entry`, pool `FOR UPDATE` patterns from Request locks (conceptual only — **separate** tables). |
| **Migrations** | `project_funding_pools`, `project_contributions`, invitations. |
| **RPCs** | Contribute; lazy status eval; **stub** refund or admin-only refund until UD-19. |
| **Tests** | Overfund prevention; concurrent contribute; no auto-refund cron. |
| **Acceptance** | Three funding settings; gate assignments on min target (enforced in IP-12). |

**Blocker:** **UD-19** before production contributor refund RPCs. **Non-blocking:** contribute + reservation attribution columns with **interim** eligible balance = gross − reserved (admin override).

**Assumption (isolated):** UD-06 terminal Funding Unsuccessful; UD-03 display name on activity feeds.

---

## Phase IP-12 — Assignments, reservations, independent commencement

**Workstreams:** WS7, WS14 — product **Phase 7**

| Field | Detail |
|-------|--------|
| **Objective** | Multi-Worker assignments after min funding target; `reserve_assignment_compensation`; `start_assignment` per Worker. |
| **Non-goals** | Request 24h Start (Request domain only). |
| **Dependencies** | IP-11. |
| **Migrations** | `project_assignments`, terms, reservations. |
| **RPCs** | Gate on pool ≥ min target; no double reserve. |
| **Tests** | Block below min target; early commencement when enabled. |
| **Acceptance** | Workers start independently when secured. |

**Blocker (GA):** **UD-20** when early commencement disabled.

**Assumption (isolated):** UD-15 chat on separate tables.

---

## Phase IP-13 — Project deliverables, milestones, payouts, disputes

**Workstreams:** WS8, WS12, WS14 — product **Phase 8**

| Field | Detail |
|-------|--------|
| **Objective** | Mirror Request milestone patterns at assignment scope; 10% fee on payout; assignment-scoped problems. |
| **Dependencies** | IP-12. |
| **Inspect** | `wallet_release_milestone_kobo`, `service_problems` patterns |
| **Non-goals** | 72h auto-complete on Project milestones. |
| **Tests** | Fee; dispute holds payout. |
| **Acceptance** | Per assignment isolation. |

**Blockers (closure):** **UD-04**, **UD-05**.

---

## Phase IP-14 — Discovery, profile activity, Admin operations, PWA parity, ops

**Workstreams:** WS10, WS11, WS12, WS13, WS14 — product **Phases 9–11**

| Field | Detail |
|-------|--------|
| **Objective** | `search_projects`, profile tabs, admin Project/refund views; PWA catch-up; **OV-01** auto-complete scheduler documented or implemented. |
| **Dependencies** | IP-10+ as features ship; UD-01 for public discovery. |
| **Inspect** | `admin_operations.sql`, `auto_complete_due_requests` grants (`service_role` only) |
| **Ops** | Schedule `auto_complete_due_requests` (Supabase cron, Edge, or runbook + admin recovery). |
| **Acceptance** | `pnpm pwa:test`; manual checklists in `apps/pwa/docs/`. |

---

## Unresolved decisions — implementation impact

### Blocking (do not ship production behaviour without approval or explicit interim scope)

| ID | Topic | Blocks |
|----|--------|--------|
| **UD-01** | Project visibility modes / RLS / discovery | IP-10 public discovery, IP-14 Projects search |
| **UD-19** | Contributor reservation allocation + rounding | IP-11 refund RPCs |
| **UD-04**, **UD-05** | Unused funds / cancellation split | IP-13 GA, Project financial closure |
| **UD-21** | Qualifying deliverable for missed dismiss | IP-4 production dismiss |
| **UD-20** | Early commencement off — start guards | IP-12 GA |
| **UD-08–10** | Crown automation | IP-7 automated hooks |
| **UD-13** | Paid Premium | Paid conversion only (trial OK in IP-9) |
| **—** | Stale proposed deadline at accept (spec gap) | IP-3 accept validation |
| **—** | Dismiss vs dispute vs `completion_pending` (spec gap) | IP-4 / IP-8 |

### Non-blocking (documented assumptions — isolate behind flags or admin paths)

| ID | Assumption | Isolation |
|----|------------|-----------|
| UD-16 | Keep `scheduled_for` optional in create UI | Separate field from expiry |
| UD-17 | No general expiry extension | Out of scope until decided |
| UD-12 | Notifications in header | UX only |
| UD-14 | Trial once per `user_id` | Harden later |
| UD-06 | Funding Unsuccessful terminal | No reopen RPC until decided |
| UD-03 | No anonymous contributors | Default named activity |
| UD-15 | Separate assignment chat tables | IP-12 optional chat |
| UD-11 | Search Top ranking | Stub or recency |
| OV-01 | Auto-complete not scheduled in repo | Runbook + admin recovery until scheduled |
| OV-02 | No CI in repo | Manual `pnpm validate` / `db:test` at gate |

---

## Final section

### 1. Recommended implementation sequence

```
IP-0 (foundations)
  ├─ IP-1 (expiry) ────────────────┐ parallel Request track
  ├─ IP-2 (Start + failure dismiss)│
  │       └─ IP-3 (deadlines)      │
  │              └─ IP-4 (missed dismiss) [*UD-21]
  │       └─ IP-8 (hardening)      │
  ├─ IP-5 (usernames) ── IP-6 (nav) ── IP-7 (Crown)
  └─ IP-9 (Premium trial)
         └─ IP-10 (Project create) [*UD-01 discovery]
              └─ IP-11 (pool) [*UD-19 refunds]
                   └─ IP-12 (assignments) [*UD-20]
                        └─ IP-13 (assignment work) [*UD-04/05]
                             └─ IP-14 (discovery, admin, PWA, OV-01)
```

**Repository-driven adjustments vs roadmap-only ordering:**

1. **IP-2 before IP-3** (0a before 0b) — mandatory.  
2. **Milestone auto-begin reversal** is part of IP-2, not a later cleanup.  
3. **Wire Start UI** in IP-2 — backend alone is insufficient (`useStartRequest` unused).  
4. **Premium (IP-9) before Projects (IP-10–13)** — greenfield, no repo coupling.  
5. **Do not** bind Project work to `payment_locks.request_id` UNIQUE pattern.

### 2. Critical blockers

| Blocker | Risk if ignored |
|---------|-----------------|
| UD-19 | Incorrect contributor refunds |
| UD-01 | Wrong public exposure of Projects |
| UD-21 | Wrong missed-delivery dismiss triggers |
| Stale deadline at accept | Illegal or absurd adjusted deadlines |
| Milestone auto-begin (current code) | Work/payout before Start — spec violation |
| OV-01 | Single-pay auto-complete never runs in prod |

### 3. Decisions requiring approval before coding

1. **Stale proposed delivery at accept** — rule for IP-3.  
2. **Dismiss interaction with disputes and completion_pending** — IP-4 / IP-8.  
3. **UD-21** deliverable definition — IP-4.  
4. **UD-19** formula — before IP-11 refund RPCs.  
5. **UD-01** visibility matrix — before IP-14 Project discovery.  
6. **UD-20** — before IP-12 production `start_assignment` guards when early commencement off.

### 4. Testing and deployment strategy

| Layer | Strategy |
|-------|----------|
| **Database** | Every IP phase adds/extends pgTAP; run `pnpm db:test` before merge. |
| **Mobile** | Primary QA; unit tests for milestones/completion-proof; `pnpm validate` |
| **PWA** | Incremental after mobile per phase; `pnpm pwa:test` at IP-14. |
| **Edge** | Unchanged unless NIN/Paystack touch; `pnpm functions:test` |
| **Deploy** | Migrations forward-only; expand-contract for new columns (nullable → backfill → enforce). |
| **Ops** | IP-0 + IP-14: document `auto_complete_due_requests` invoker; use `admin_execute_operational_recovery` until scheduled. |

**No in-repo CI (OV-02):** treat `pnpm validate && pnpm db:test` as **manual merge gate** until CI exists.

### 5. Phases ready for implementation (pending explicit approval to code)

| Phase | Ready when |
|-------|------------|
| **IP-0** | Immediately (docs/process). |
| **IP-1** | Product approved; no open blockers. |
| **IP-2** | Product approved; no open blockers. |
| **IP-5** | Parallel anytime after IP-0. |
| **IP-9** | Parallel anytime after IP-0 (trial scope). |

### 6. Phases that must wait

| Phase | Wait for |
|-------|----------|
| **IP-3** (full accept validation) | Stale-deadline product rule |
| **IP-4** | UD-21 (+ dispute matrix decision) |
| **IP-10** (public discovery) | UD-01 |
| **IP-11** (refund RPCs) | UD-19 |
| **IP-12** (GA commencement) | UD-20 |
| **IP-13** (financial closure) | UD-04, UD-05 |
| **IP-7** (auto Crown) | UD-08–10 |
| **IP-14** (Projects search) | UD-01, substantial IP-10–13 |

---

## Pre-implementation gate checklist

Before any migration or app change:

- [ ] Explicit stakeholder approval to begin **IP-*** phases listed in §5.  
- [ ] `pnpm db:reset && pnpm db:test` green on `main` baseline.  
- [ ] Types regeneration procedure agreed (mobile + PWA).  
- [ ] Product decisions §3 filed or accepted as interim scope.  
- [ ] Rollback note per phase recorded in PR/migration description.

**Stop here.** No code changes until approval.

---

## References

| Document | Path |
|----------|------|
| Product spec | `docs/product/ACTIVE_PRODUCT_SPEC_V1.md` |
| Roadmap | `docs/product/ACTIVE_IMPLEMENTATION_ROADMAP.md` |
| Gaps | `docs/product/ACTIVE_EXISTING_VS_PLANNED.md` |
| Unresolved | `docs/product/ACTIVE_UNRESOLVED_DECISIONS.md` |
| Repository audit | `docs/product/ACTIVE_REPOSITORY_AUDIT.md` |
| Milestone technical doc | `supabase/docs/request-milestone-payments.md` |