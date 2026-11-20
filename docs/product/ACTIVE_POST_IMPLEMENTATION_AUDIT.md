# Active — Post-Implementation Reconciliation Audit

**Audit date:** 2026-11-19  
**Method:** Read-only inspection of the repository; no application code or migrations were modified; no `db:reset` or other destructive database commands were run.

This audit reconciles **actual repository state** against the implementation prompt sequence (Requests phases, Projects, Identity/Search/Premium/Crown, Admin/PWA/Ops). Completion reports from prior agent sessions are **not** treated as proof.

---

## 1. Repository state

### Git

| Item | Value |
|------|--------|
| Branch | `dev` (tracking `active-web/dev`) |
| Last commit on branch | `20bf7eb` — *Add request milestone payments end-to-end on PWA and mobile.* |
| Uncommitted work | **Large** — dozens of modified files and **untracked** migrations, tests, admin routes, mobile Search/Public profile, PWA search/engagement, `operational-scheduler`, `docs/product/`, `docs/operations/` |

### Risk: uncommitted implementation

Most work from the recent implementation sequence exists only as **working tree / untracked files**, not in `git log`. That creates:

- No reproducible deployable revision for Projects, Phase 9–10, or request Start/deadline migrations.
- Risk of loss or partial application if another developer resets or checks out without this tree.
- **Recommendation:** commit in logical slices after verification (see §6).

### New migrations (untracked unless already applied locally)

| Migration | Area |
|-----------|------|
| `20261120120000_request_start_window_and_failure_dismiss.sql` | Start window, failure-to-start dismiss |
| `20261121120000_calendar_delivery_deadlines.sql` | Proposed delivery, Start shift, mutual extension RPCs |
| `20261122120000_missed_delivery_dismiss.sql` | Missed-delivery dismissal |
| `20261123120000_engagement_start_by_at.sql` | `start_by_at` on `get_engagement` |
| `20261124120000_project_funding_foundations.sql` | Project domain, pool, contributions, trial |
| `20261125120000_project_pool_reservations.sql` | Pool reservations (refund stub UD-19) |
| `20261126120000_project_assignments.sql` | Assignments, milestones scaffold |
| `20261127120000_project_assignment_delivery.sql` | Deliverables, payouts, disputes |
| `20261128120000_profiles_search_premium_crown.sql` | Usernames, search, Premium, Crown foundations |
| `20261129120000_admin_projects_ops_pwa.sql` | Admin project oversight, premium/crown admin, `evaluate_due_project_funding` |

### Configuration (modified, uncommitted)

- `supabase/config.toml` — `operational-scheduler`, `OPERATIONAL_CRON_SECRET`, `verify_jwt = false`
- `.env.example` — operational cron secret documented
- `package.json` — `db:types` copies types to PWA
- `docs/admin-dashboard.md`, `docs/operations/production-scheduling.md`
- `supabase/functions/operational-scheduler/index.ts` (untracked)

### Tests added (untracked)

`project_*.test.sql`, `phase9_*.test.sql`, `admin_projects_ops.test.sql`, `request_*_dismiss*.test.sql`, `request_delivery_deadlines.test.sql`, etc. Several **modified** legacy `supabase/tests/*.test.sql` files are also uncommitted.

---

## 2. Verification runs (actual outcomes, non-destructive)

Commands run against the **current local database** (no reset during audit):

| Command / scope | Result |
|-----------------|--------|
| `supabase test db` project + phase9 + admin (`project_*.sql`, `phase9_*.sql`, `admin_projects_ops`, `admin_operations`) | **PASS** — 139 tests |
| `supabase test db` `request_start_and_failure_dismiss.test.sql` | **FAIL** — SQL syntax error in test (~line 182); 10 subtests passed before abort |
| `supabase test db` `request_delivery_deadlines.test.sql` | **FAIL** — 5 of 13 failed |
| `supabase test db` `request_missed_delivery_dismiss.test.sql` | **FAIL** — parse/plan error (exit 3) |
| `pnpm functions:test` | **PASS** — 24 tests |
| `pnpm pwa:test` | **PASS** — 19 tests |
| `pnpm admin:typecheck` | **PASS** |
| `pnpm validate` (full) | **Not re-run**; known **FAIL** on mobile `tsc` (~16 errors, pre-existing / unrelated to Projects) |
| `pnpm db:test` (full suite) | **Not re-run**; prior full run reported **FAIL** on multiple legacy suites |

**Note:** Request lifecycle SQL may be correct while **test harness** is broken or DB state diverged — treat request SQL tests as **needs repair**, not as proof of failure of RPCs.

---

## 3. Feature matrix

Legend:

- **CV** — Complete and verified (code + tests or strong pgTAP where run green)
- **IV** — Implemented but not fully verified
- **PART** — Partially implemented
- **MISS** — Missing user workflow
- **BLOCK** — Blocked by unresolved product decision
- **REG** — Existing behaviour; protect from regression

### Requests

| Feature | Status | Mobile | PWA | Backend | Tests / notes |
|---------|--------|--------|-----|---------|---------------|
| Creation, expiry, tags, location | **REG** | `app/request/new`, `create_request` RPCs | `RequestNewPage`, `RequestCreateWizard` | Migrations through `20261117180100_*` | `active.test.sql` (suite overall flaky) |
| Responses, counteroffer | **REG** | `respond/[id]`, `ResponseCreationFlow` | `RespondPage`, `responses-api` | `respond_to_request` | Marketplace tests partial |
| Acceptance, payment lock | **REG** | `request/[id]`, `accept_response` | `requester-api` | `lock_request_escrow_for_amount` | Wallet tests have failures in full suite |
| Proposed delivery on respond | **IV** | `ProposedDeliveryPicker`, `ResponseCreationFlow` | **MISS** — types only, no picker wired | `20261121120000_calendar_delivery_deadlines.sql` | `request_delivery_deadlines.test.sql` **FAIL** |
| Universal Worker **Start** + 24h window | **IV** | `engagement/[id].tsx`, `useStartRequest`, `EngagementLifecycleCard` | **PART** — `EngagementPage` Start button; no lifecycle card | `start_request`, `start_by_at`, `request_engagement_start_window_interval()` | `request_start_and_failure_dismiss.test.sql` **broken test SQL** |
| Calendar deadline shift on Start | **IV** | Start RPC server-side | Same | `start_request` in `20261121120000_*` | Same as above |
| 30-day max delivery from Start | **IV** | Enforced in SQL | Not surfaced in UI | `request_engagement_max_delivery_interval()` | Delivery tests **FAIL** |
| Failure-to-start dismiss | **IV** | `useDismissWorkerFailureToStart`, engagement UI | **MISS** — RPC in types only | `dismiss_worker_failure_to_start` | Test file broken |
| Missed-delivery dismiss | **IV** | `useDismissWorkerMissedDelivery` | **MISS** | `dismiss_worker_missed_delivery` | `request_missed_delivery_dismiss.test.sql` **FAIL** |
| Mutual delivery extensions | **PART** | **MISS** UI | **MISS** UI | `agree_delivery_extension`, `request_delivery_deadline_extensions` | No app caller besides types |
| Single + milestone financial flows | **REG** / **IV** | Milestone UI extensive | **PART** milestone sheets | Milestone migrations `2026111718*` | `request_milestone_payments.test.sql` modified uncommitted |
| Awaiting-review `extend_request` | **REG** | `useExtendRequest` on `request/[id]` | API in `requester-api`, unclear UI | `extend_request` | `request_awaiting_review.test.sql` |
| 72h auto-complete | **IV** | N/A | N/A | `auto_complete_request`, `auto_complete_due_requests` | **OV-01** — local `operational-scheduler` wired; not production |
| Admin single-request recovery | **CV** | N/A | N/A | `admin_execute_operational_recovery` | `admin_operations.test.sql` **PASS** |

### Projects

| Feature | Status | Mobile | PWA | Backend | Tests / notes |
|---------|--------|--------|-----|---------|---------------|
| Project creation | **PART** | **MISS** — no `create_project` call in app code | **MISS** | `create_project`, Premium trial on profile | `project_funding_foundations.test.sql` **PASS** |
| Visibility / funding visibility | **BLOCK** UD-01 | N/A | N/A | Interim `project_visibility = private`; public **funding** search only | Comment in migration |
| Funding pool, budget, targets, min contribution | **CV** (SQL) | **MISS** UI | **MISS** | `20261124120000_*` | pgTAP **PASS** |
| Contributions | **CV** (SQL) | **MISS** | **MISS** | `contribute_to_project` etc. | pgTAP **PASS** |
| Reservations / accounting | **IV** | **MISS** | **MISS** | `20261125120000_*` | pgTAP **PASS** |
| Contributor refunds | **BLOCK** UD-19 | **MISS** | **MISS** | `claim_project_contribution_refund` → P0001 | Tests assert block |
| Assignments (create, accept, terms, start) | **IV** | **MISS** | **MISS** | `20261126120000_*` | `project_assignments.test.sql` **PASS** |
| Deliverables, milestones, approve, payout | **IV** | **MISS** | **MISS** | `20261127120000_*` | `project_assignment_delivery.test.sql` **PASS** |
| Assignment disputes | **IV** | **MISS** | **MISS** | `project_assignment_disputes`, `report_project_assignment_problem` | pgTAP delivery suite |
| Project discovery (search) | **PART** | `(tabs)/search.tsx`, `search_discover` | `SearchPage.tsx`, `discovery-api` | `search_projects`, `search_discover` | `phase9_*.test.sql` **PASS** — no deep link to project detail |
| Project lifecycle closure / unused funds | **BLOCK** UD-04, UD-05 | **MISS** | **MISS** | No GA closure RPCs | — |

### Identity and profiles

| Feature | Status | Mobile | PWA | Backend | Tests |
|---------|--------|--------|-----|---------|-------|
| Username set / unique | **IV** | `profile/edit.tsx`, `set_username` | **MISS** | `profiles.username`, `set_username` | phase9 **PASS** |
| Public profile allowlist | **IV** | `app/u/[username].tsx`, `get_public_profile` | **MISS** | RPC allowlist | phase9 **PASS** |
| People search | **IV** | Search People tab | Search People tab | `search_people` | phase9 **PASS** |
| Profile activity hub (paginated) | **MISS** | Activity via `/(tabs)/activity` + profile link; not profile tabs | `ActivityPage` | No `list_user_public_activity` | Spec PLN |
| Crown / reputation user UI | **PART** | No Crown settings UI (`set_my_crown_public` not wired) | **MISS** | `user_reputation`, ledger, `get_my_reputation` | phase9 baseline |

### Premium

| Feature | Status | Mobile | PWA | Backend | Tests |
|---------|--------|--------|-----|---------|-------|
| 30-day trial, no card | **IV** | Trial via `start_premium_trial` path in SQL; **MISS** in-app trial UX | **MISS** | `profiles.premium_trial_*`, `get_my_entitlements` | phase9 **PASS** |
| `can_create_projects` gate | **IV** | **MISS** — no project create UI enforcing | **MISS** | `get_my_entitlements()` | phase9 |
| Existing Project after expiry | **IV** | N/A | N/A | Documented behavior in SQL comments | Not E2E tested |
| Admin trial override | **IV** | N/A | N/A | `admin_override_premium_trial` | `admin_projects_ops.test.sql` **PASS** |
| Admin dashboard UI | **IV** | N/A | N/A | `UserTrustPanel`, API routes (uncommitted) | Manual |

### Navigation and UI

| Feature | Mobile | PWA | Notes |
|---------|--------|-----|-------|
| Bottom nav: Home, **Search**, Create, Notifications | **IV** — `(tabs)/_layout.tsx`; Activity tab **removed** from bar | **PART** — Search in tab bar; Activity not primary | Activity still at `/(tabs)/activity` (hidden web: `href: null`) |
| Home vs Search decoupled | **IV** — `index.tsx` → Search tab | **IV** — `HomePage` no `q=` | — |
| Create experience | **REG** | **REG** | Composer / request new |
| Project creation UX | **MISS** | **MISS** | — |
| Wallet | **REG** | **PART** (deposit parity improved per commits) | — |
| Settings / notifications | **REG** | **REG** / **PART** | — |
| Skeleton / empty / error | **REG** | **REG** | `StateView`, query skeletons |

### Admin

| Area | Status | Paths |
|------|--------|-------|
| Users, requests, reports, finance, withdrawals, audit | **REG** | `apps/admin` existing routes |
| Project oversight | **IV** (uncommitted) | `apps/admin/src/app/(dashboard)/projects/`, `admin_list_projects`, `admin_get_project` |
| Crown / Premium moderation | **IV** (uncommitted) | `UserTrustPanel`, `admin_apply_reputation_delta`, `admin_override_premium_trial` |
| Operational issues + recovery | **REG** | `operational-issues`, `admin_execute_operational_recovery` |

### Website

| Area | Status |
|------|--------|
| Marketing site | **REG** — `apps/website` static pages only; no marketplace |

---

## 4. Behaviour tracing (high-signal gaps)

1. **Projects are a database product without a client product** — All major Project RPCs exist and pgTAP passes, but **no** mobile or PWA screen calls `create_project`, contribute, assign, or deliver. Search lists project rows only.

2. **Request Start/dismiss is mobile-heavy** — Backend + mobile engagement implement Start and dismiss; PWA has Start only; dismiss and `EngagementLifecycleCard` missing on PWA; mutual extension RPCs have **no** UI in either app.

3. **Premium is entitlement without creation gate in UI** — `get_my_entitlements` exists; nothing in app code gates a Project create flow that does not exist yet.

4. **Profile activity migration incomplete** — Spec: activity hub on profile with tabs. Implemented: Activity tab off main nav + “My activity” link from `profile/index.tsx`.

5. **Documentation drift** — `ACTIVE_EXISTING_VS_PLANNED.md` still lists username/Start/Projects as **PLN** in places; codebase has superseded that for SQL and partial mobile. Treat that doc as **stale** until refreshed.

6. **Duplicate / parallel implementations** — PWA and mobile duplicate `features/` (no shared package). `engagement-lifecycle.ts` copied to PWA; Search/discovery-apis parallel. Intentional per plan but increases parity drift risk.

7. **Security / financial** — Project refunds and proportional pool math **BLOCKED** (UD-19). Admin project detail correctly surfaces refund note. Crown adjust restricted to super_admin (fixed from `assert_admin_caller`-only). Operational scheduler uses shared secret locally (`verify_jwt = false`).

---

## 5. Blocked by unresolved decisions (do not ship as “complete”)

| ID | Impact |
|----|--------|
| **UD-01** | Full Project visibility and discovery |
| **UD-19** | Contributor refunds |
| **UD-04, UD-05** | Project financial closure |
| **UD-06** | Reopen funding after unsuccessful |
| **UD-08–10** | Automated Crown points / appeals |
| **UD-11** | Search Top ranking (interim `deferred_ud_11`) |
| **UD-13** | Paid Premium |
| **UD-20** | Early commencement guards (interim SQL exists) |
| **UD-21** | Qualifying deliverable for missed dismiss |
| **OV-01** | Production cron (local scheduler only) |
| **OV-02** | No in-repo CI |

---

## 6. Recommended recovery strategy

### Immediate (preserve work)

1. **Do not reset or delete** the working tree; commit in slices:
   - Slice A: Request lifecycle migrations + tests (fix broken pgTAP SQL first).
   - Slice B: Project migrations + `project_*.test.sql`.
   - Slice C: Phase 9 migrations + mobile Search/profile/username.
   - Slice D: Admin Phase 10 + `operational-scheduler` + config/docs.
   - Slice E: PWA search/Start parity.

2. **Refresh** `ACTIVE_EXISTING_VS_PLANNED.md` to match this audit (documentation only).

### Verification gate before calling any phase “done”

1. Fix and green: `request_start_and_failure_dismiss.test.sql`, `request_delivery_deadlines.test.sql`, `request_missed_delivery_dismiss.test.sql`.
2. Re-run focused suites: project + phase9 + admin (**currently green**).
3. Decide minimum **mobile MVP for Projects** (create + contribute + assign) vs admin/SQL-only until UD-01/UD-19 settle.
4. PWA parity checklist: dismiss Start failures, proposed delivery on respond, optional `EngagementLifecycleCard`.

### Product sequencing (aligned with `ACTIVE_IMPLEMENTATION_PLAN.md`)

1. Resolve or document interim scope for **UD-19** before any contributor refund UI or admin refund actions.
2. Resolve **UD-01** before treating Project search as GA.
3. Wire **OV-01** when a hosted Supabase project exists; until then document manual `operational-scheduler` curl (local only today).
4. Profile activity hub (IP-14) remains a **separate** UI track from Activity tab relocation.

### Regression protection

- Keep running: `project_*.test.sql`, `phase9_*.test.sql`, `admin_operations.test.sql`, `admin_projects_ops.test.sql`, `pnpm functions:test`, `pnpm pwa:test`, `pnpm admin:typecheck` on every merge.
- Treat full `pnpm db:test` and `pnpm validate` as **release** gates after fixing known legacy failures.

---

## 7. Summary judgment

| Layer | State |
|-------|--------|
| **SQL / Projects domain** | **Substantially implemented** in uncommitted migrations; pgTAP green on project/phase9/admin subsets |
| **SQL / Request Start & deadlines** | **Implemented** in migrations; **test verification broken or failing** |
| **Mobile Requests** | **Ahead of PWA** on Start, dismiss, proposed delivery |
| **Mobile/PWA Projects** | **Missing** end-user workflows despite backend |
| **Identity / Search / Premium (Phase 9)** | **Mobile partial**; PWA search partial; Crown user UI minimal |
| **Admin Phase 10** | **Partial** — new project/trust panels **uncommitted** |
| **Ops** | **Local** operational scheduler configured; not production |

**Production readiness:** **Not claimed.** Blockers: UD-19, UD-01, UD-04/05, broken/ failing request SQL tests, uncommitted work, no hosted scheduler, full CI/validate not green.

---

*Generated by repository inspection and non-destructive test runs. No application code was modified during this audit.*