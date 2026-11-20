# Active — Cross-Platform Completion & Regression Audit

**Audit date:** 2026-11-19  
**Scope:** Mobile (`apps/mobile`), PWA (`apps/pwa`), Admin (`apps/admin`), marketing website (`apps/website`), Supabase backend (`supabase/`).  
**Method:** Static route/feature inspection, migration/RPC review, and **executed** repository validation commands (results below are from this audit run unless noted).

**Production readiness:** **Not ready.** Critical gaps remain in cross-platform Projects UX, automated regression coverage for core Request/wallet flows, mobile typecheck CI, and unresolved financial product decisions (UD-19+). Do not treat parity in one client as completion elsewhere.

---

## Executive summary

| Area | Verdict |
|------|---------|
| **Requests marketplace (legacy core)** | Backend strong where isolated pgTAP passes; **suite regression** on `create_request` overload breaks many integration tests. Mobile/PWA largely wired; known partial surfaces documented in PWA marketplace report. |
| **Search, People, Username, Public profile** | **Supported** on mobile + PWA; backed by phase 9 migration + pgTAP (25 tests pass). |
| **Projects** | **Backend largely implemented** (funding, pool, assignments, delivery, consumer read RPCs). **Mobile partial** (create, detail, worker assignment flow). **PWA minimal** (read-only detail; no create/assignment/funding UI). |
| **Crown / Premium / Settings** | **Mobile supported** (settings hub, trial, privacy). **PWA partial** (Crown on profile/settings; no reputation history screen; broken `/project/new` link). |
| **Wallet** | **Mobile + PWA** deposit/withdraw routes exist; **PWA has no Wallet tab** (wallet via profile/deep links). Financial pgTAP mixed: core wallet tests pass individually; policy/audit suites failing. |
| **Admin** | Ops surfaces implemented (users, requests, **projects**, finance). `admin_projects_ops.test.sql` passes. Some admin user/finance tests fail in full suite. |
| **Website** | **Intentionally unsupported** for in-app product (marketing only). |

---

## Feature parity by platform

Legend: **S** Supported · **P** Partially implemented · **M** Missing · **I** Intentionally unsupported

| Feature | Mobile | PWA | Admin | Website |
|---------|--------|-----|-------|---------|
| **Navigation** | **S** — 5 tabs: Home, Search, Create, Wallet, Profile | **P** — 4 tabs: Home, Search, Create, Notifications; Profile/Wallet/Activity via stack routes (no tab parity with native) | **S** — full dashboard nav | **I** — marketing nav only |
| **Create** | **P** — Request + Project (Premium-gated) from Create tab | **P** — Request composer; **M** — no `/project/new` route (link from Premium settings is dead) | **I** | **I** |
| **Requests** | **S/P** — full lifecycle UI incl. milestones on engagement | **P** — per `apps/pwa/docs/marketplace-implementation.md` (accept/wallet gaps) | **S** — list/detail ops | **I** — static showcase cards |
| **Projects** | **P** — create, detail tabs, worker assignment screen (accept/reserve/start/submit); **M** — creator assignment creation, milestone approve/payout/revision UI, contribute UI polish | **M** — `ProjectDetailPage` read-only summary only | **S** — `admin_list_projects` / detail | **I** |
| **Search** | **S** — dedicated tab, `search_discover`, categories, pagination (non-Top) | **S/P** — `/search`, same RPCs; **P** — `HomeTabBar` typecheck break on `ionIcons.search` | **I** | **I** |
| **People** | **S** — Search category + person rows → public profile | **S** — same | **S** — user admin | **I** |
| **Username** | **S** — edit, validation, public route `u/[username]` | **S** — profile edit + `/u/:username` | **S** — clear username API | **I** |
| **Public profile** | **S** — `get_public_profile`, allowlist fields, Crown summary | **S** — `PublicProfilePage` + `CrownSummary` | **S** — user trust/reputation admin APIs | **I** |
| **Profile activity** | **S/P** — hub tabs (requests, responses, projects); skeletons/empty states | **P** — `/activity` page; less parity with native hub | **I** | **I** |
| **Settings** | **S** — `/settings` (+ privacy, premium, reputation history) | **P** — `/settings`, privacy, premium; **M** — dedicated reputation history route | **S** — settings & access | **I** |
| **Crown** | **S** — hub + settings + privacy visibility | **P** — profile/settings; **M** — reputation history UI | **S** — admin reputation delta | **I** |
| **Premium** | **S** — trial start, entitlements, create-project gate | **P** — premium settings; trial RPC wired | **S** — premium trial admin route | **I** |
| **Wallet** | **S** — tab + full flows | **P** — full route tree, **M** tab entry | **S** — wallets, withdrawals, transactions | **I** |
| **Notifications** | **S** — tab/bridge (native) | **S** — tab + `/notifications` | **I** (inbox is client) | **I** |

---

## Completed features (by area)

### Backend (verified tests)

- Profiles, usernames, `search_people`, `search_discover`, public profile allowlist, reputation row, Premium trial entitlements (`phase9_profiles_search_premium_crown.test.sql` — **21 tests**, run batch **25** with premium expiry).
- Post–trial Premium: view project OK, `create_project` blocked (`premium_expiry_project_access.test.sql` — **4 tests**).
- Project consumer reads: `assert_may_view_project`, `get_project`, list RPCs (`project_consumer_read_rpcs.test.sql`).
- Project financial lifecycle: funding, pool reservations, assignments, delivery (`project_funding_foundations`, `project_pool_reservations`, `project_assignments`, `project_assignment_delivery`).
- Wallet hardening: deposits (Paystack test), withdrawals, **client wallet mutators revoked** (`wallet_client_mutators_revoked.test.sql`).
- Admin project ops (`admin_projects_ops.test.sql` — **7 tests**).

### Mobile

- Five-tab navigation; Search decoupled from Home `q=`.
- Discovery unit tests; username unit tests; request response section partitioning tests.
- Project create (Premium), project detail, assignment worker path (accept → reserve by creator → commence → submit).
- Request engagement milestones (approve UI on request flow, not project assignments).
- Settings consolidation, Crown visibility, public profiles.

### PWA

- Search page with `search_discover`; public profiles; settings/privacy/premium; wallet route tree; notifications tab.
- Vitest suite **19/19 passed** (milestone logic, auth, wallet callback, etc.).

### Admin

- Projects dashboard pages; user premium/reputation/NIN tooling; permission-gated nav (all items `implemented: true`).

### Website

- Marketing pages, FAQ, static explore content — **by design**, not a product client.

---

## Incomplete features

| Item | Notes |
|------|--------|
| **PWA project parity** | No create, fund, contribute, or assignment workspace; detail is informational only. |
| **PWA `/project/new`** | Linked from `PremiumSettingsPage` but **not registered** in `routes.tsx`. |
| **Mobile project creator tools** | No UI for `create_project_assignment`, approve milestone/payout, revision/dispute flows (RPCs exist in types). |
| **Mobile project approvals** | Assignment screen lists milestones; no `approve_project_assignment_*` actions. |
| **Contribution refunds** | Blocked on **UD-19** (refund allocation from shared pool). |
| **Search “Top” ranking** | **UD-11** — fixed slices, not ranked relevance. |
| **Project visibility modes** | **UD-01** — affects RLS/indexing/discovery semantics. |
| **PWA reputation history** | RPC `list_my_reputation_history` not exposed in UI (mobile has `settings/reputation.tsx`). |
| **Shared UI package** | Duplicate `username`, discovery modules across mobile/PWA. |
| **Mobile CI validate** | `pnpm --filter @active/mobile validate` **fails** typecheck (pre-existing + milestone sheet typings). |

---

## Functional regression focus

| Concern | Finding |
|---------|---------|
| **Request acceptance** | Mobile `accept_response` wired; PWA partial (wallet top-up UX). Client tests: `test:request-response-sections` **3/3 pass**. |
| **Payment locks** | Engagement copy + milestone approve on **requests**; pgTAP for milestones **does not run** (see below). |
| **Start & delivery deadlines** | `request_delivery_deadlines.test.sql` / related — **FAIL** early exit (same root as `create_request`). |
| **Refunds** | Request refund messaging in client; project contribution refunds **not product-complete** (UD-19). |
| **Milestone approvals (requests)** | Mobile `EngagementMilestoneProgress` + `approve_engagement_milestone`; **not regression-tested** in DB suite currently. |
| **Project reservations** | pgTAP **pass** (`project_pool_reservations.test.sql`). Mobile creator **reserve** button on assignment. |
| **Assignment commencement** | Mobile worker **Commence work** after reservation; backend `start_project_assignment` in API layer. |
| **Public/private profile** | phase 9 tests cover allowlist; privacy toggle via `set_crown_public` / settings. |
| **Search permissions** | `search_discover` / `search_people` granted to `authenticated` only; public profile via username RPC. |
| **Premium entitlement** | Trial start + `get_my_entitlements`; expiry test passes; create project gated. |

### Critical test regression: `create_request` overload

Multiple integration tests fail immediately with:

```text
ERROR: function create_request(...) is not unique
HINT: Could not choose a best candidate function. You might need to add explicit type casts.
```

**Affected in this audit:** `active.test.sql`, `request_milestone_payments.test.sql`, `wallet_request_funding.test.sql`, and (in full `pnpm db:test`) cascading parse/plan failures across request/chat/completion suites.

**Impact:** Cannot claim regression safety for core marketplace rules until tests are updated or duplicate SQL overloads are removed/disambiguated.

---

## Security findings

| Topic | Assessment |
|-------|----------------|
| **RLS / direct client writes** | `wallet_client_mutators_revoked.test.sql` **passes** — wallet mutations not exposed for arbitrary client SQL. |
| **RPC authorization** | Project reads use `assert_may_view_project` / role-aware list RPCs (covered by `project_consumer_read_rpcs`). |
| **Public profile exposure** | `get_public_profile` returns allowlisted fields; phase 9 tests include search + privacy cases. |
| **Wallet operations** | Deposit/withdraw flows tested in isolated files; **withdrawal_policy** and **wallet_withdrawal_financial_audit** show failures (syntax/constraint — see financial). |
| **Admin permissions** | Middleware + per-route permission keys; projects reuse `requests` permission in nav config (worth explicit permission split later). |
| **Premium / Crown** | Entitlements via `get_my_entitlements`; trial mutation `start_premium_trial` server-side. |

No automated penetration test was run; findings are from schema, grants, and pgTAP.

---

## Financial integrity findings

| Topic | Assessment |
|-------|----------------|
| **Ledger / reservations (projects)** | Isolated pgTAP: funding, pool reservations, assignment compensation reserve, delivery — **all pass** (150 tests in batch). |
| **Idempotency (deposits)** | Deno `settle_test.ts` — **8/8 pass** in `pnpm functions:test`. |
| **Refunds (projects)** | **Incomplete** — UD-19; do not enable `claim_project_contribution_refund` in production without approved algorithm. |
| **Payout calculations (assignments)** | Backend tests for delivery path pass; **creator approve/payout UI missing** on mobile for project milestones. |
| **Withdrawal policy tests** | `withdrawal_policy.test.sql` — **FAIL** (check constraint on seed data + `syntax error at or near ":"` in expectations). |
| **Financial audit tests** | `wallet_withdrawal_financial_audit.test.sql` — **6/14 failed** in full suite run. |

---

## Cross-platform gaps (priority)

1. **PWA Projects** — dead create link, no funding/assignment/contribute UX.  
2. **Tab model** — Mobile Wallet + Profile vs PWA Notifications-centric tab bar.  
3. **Project creator/worker completion** — backend ahead of all clients; mobile ahead of PWA.  
4. **Typecheck** — PWA (`ionIcons.search`); Mobile (bottom sheets, saved-locations, chat helpers).  
5. **Test harness** — `create_request` ambiguity blocks legacy marketplace pgTAP.  
6. **Code sharing** — parallel implementations drift risk (discovery, username, project-api).

---

## Remaining product decisions

See `docs/product/ACTIVE_UNRESOLVED_DECISIONS.md`. Blockers most relevant to this audit:

| ID | Topic | Blocks |
|----|--------|--------|
| **UD-01** | Project visibility vs funding visibility | Discovery/RLS |
| **UD-11** | Search Top ranking | Search product quality |
| **UD-19** | Contribution refund allocation | Phase 6 refunds |
| **UD-04–06, UD-20** | Closure, cancellation, early commencement off-path | GA financial behavior |
| **UD-08–09** | Crown points & appeals | Full reputation automation |

---

## Tests executed (this audit)

Commands run from repo root unless noted. **Do not infer pass from prior sessions.**

| Command | Result |
|---------|--------|
| `pnpm --filter @active/mobile validate` | **FAIL** — `tsc` errors (e.g. `MilestoneApproveSheet` Backdrop, `saved-locations-api`, `CatalogueViewer`, `request-expiry-core` import). |
| `pnpm pwa:typecheck` | **FAIL** — missing `ionIcons.search`; milestone-negotiation.test.ts fixture types. |
| `pnpm pwa:test` | **PASS** — 8 files, **19** tests. |
| `pnpm admin:typecheck` | **PASS** |
| `pnpm website:typecheck` | **PASS** |
| `pnpm functions:test` | **PASS** — 24 Deno tests. |
| `pnpm db:test` | **FAIL** — Files=37, Tests=312; multiple failures (summary excerpt below). |
| `apps/mobile`: `pnpm test:discovery` | **PASS** — 3 tests. |
| `apps/mobile`: `pnpm test:username` | **PASS** — 5 tests. |
| `apps/mobile`: `pnpm test:request-response-sections` | **PASS** — 3 tests. |
| `supabase test db --local supabase/tests/phase9_profiles_search_premium_crown.test.sql supabase/tests/premium_expiry_project_access.test.sql` | **PASS** — 25 tests. |
| `supabase test db --local` project batch (consumer read, funding, pool, assignments, delivery, wallet deposit/withdrawals, client mutators revoked) | **PASS** — 8 files, **150** tests. |
| `supabase test db --local supabase/tests/admin_projects_ops.test.sql` | **PASS** — 7 tests. |
| `supabase test db --local supabase/tests/active.test.sql` | **FAIL** — `create_request` not unique. |
| `supabase test db --local supabase/tests/request_milestone_payments.test.sql` | **FAIL** — same `create_request` error. |
| `supabase test db --local supabase/tests/wallet_request_funding.test.sql` | **FAIL** — no subtests (early abort). |
| `pnpm validate` (root) | **Not run** — would fail on mobile validate per above. |

### `pnpm db:test` failure summary (2026-11-19)

Not exhaustive; highlights for triage:

- **Harness/schema:** `active.test.sql` — exit 3, no TAP plan (overload error).
- **Parse/early exit:** `completion_proof`, `pre_handshake_chat`, `request_awaiting_review`, `request_delivery_deadlines`, `request_edit`, `request_milestone_payments`, `request_start_and_failure_dismiss`, `wallet_request_funding`, `wallet_request_settlement`, `persistent_alternative_responses`, `request_missed_delivery_dismiss` — largely **create_request** or cascade.
- **Assertion failures:** `admin_user_nin_reveal` (3), `admin_users` (2), `user_bank_accounts` (4), `wallet_withdrawal_financial_audit` (6), `withdrawal_policy` (3).

---

## Production blockers

1. **DB integration regression suite** — fix `create_request` overload; restore `active.test.sql` and dependent wallet/request tests.  
2. **Withdrawal policy / financial audit pgTAP** — failures before treating payouts as audited.  
3. **Mobile `validate` / PWA typecheck** — CI-quality gates failing.  
4. **PWA broken Premium → Create project** navigation.  
5. **Project end-to-end UX** — creator assignment + approval + refunds (UD-19) across clients.  
6. **UD-01 / UD-11** — discovery and visibility product closure before broad Project launch.  
7. **Environment parity** — large unmerged migration set; production must apply migrations and re-run pgTAP in target env.

---

## Recommendations (next engineering steps)

1. Disambiguate `create_request` in SQL or update all pgTAP fixtures with explicit casts; re-run full `pnpm db:test`.  
2. Add PWA routes: `/project/new`, assignment workspace, or remove dead links until implemented.  
3. Ship mobile project creator flows (assignment create, approve/payout) against existing RPCs.  
4. Fix PWA `ionIcons` search glyph + align tab bar with product (Wallet/Profile vs Notifications).  
5. Triage mobile tsc debt blocking `validate`.  
6. Resolve UD-19 before enabling contribution refunds in any client.

---

*This document is a point-in-time audit. Re-run the commands in §Tests executed after fixes and update counts accordingly.*