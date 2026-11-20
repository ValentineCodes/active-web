# Active Implementation Roadmap (v1.0.3)

Phased plan derived from `ACTIVE_PRODUCT_SPEC_V1.md` and verified repository state. **Early workstreams:** Phase 0 (Request expiry); Phase 0a (universal Worker Start); Phase 0b (calendar delivery deadline and dismissal — **requires 0a**). Phases are **sequential where dependencies exist**; parallel work is called out explicitly.

**Legend:** **IMP** = already implemented; **NEW** = net-new work; **MOD** = change existing.

---

## Early workstreams (parallel)

### Phase 0 — Request expiry (**MOD**)

Ship before or alongside Phase 2. Does not block Phase 1.

| Attribute | Detail |
|-----------|--------|
| **Objective** | “When does it expire?” with absolute `expires_at`; decouple from `scheduled_for`. |
| **User outcome** | Today / Future date; default 11:59 PM in creator timezone (`Africa/Lagos`); optional time adjustment. |
| **Backend** | **MOD** `create_request` (explicit `p_expires_at` or timezone-aware helper); remove `request_expires_at(scheduled_for) + 24h` as sole model. |
| **Mobile/PWA** | **MOD** `request/new.tsx` copy and pickers; do not repurpose `scheduled_for` for expiry. |
| **Tests** | pgTAP timezone and boundary cases. |
| **Dependencies** | None |
| **Unresolved** | Optional work scheduling in UI (UD-16); general expiry extension policy (UD-17). |

### Phase 0a — Universal Worker Start (**MOD**, Request engagement)

Ship before Phase 0b; parallel to Phase 0 and Phases 1–11 (Request domain only).

| Attribute | Detail |
|-----------|--------|
| **Objective** | Mandatory Worker **Start** within 24h of accept; idempotent `started_at`; failure-to-start dismissal. |
| **User outcome** | After accept, Worker sees Start action (all payment structures); creator can dismiss if Start not pressed in 24h; refund 100% locked, no fee. |
| **Backend** | **MOD** `start_request`: enforce 24h from `accepted_at`; reject late Start; idempotent Start timestamp; **NEW** `dismiss_worker_failure_to_start` + refund RPC; engagement history. |
| **Database** | Persist acceptance timestamp on accept if not already authoritative; audit fields for Start window. |
| **Mobile/PWA** | **MOD** engagement UI: Start CTA, window countdown, dismiss-after-timeout. |
| **Wallet** | Failure-to-start refund idempotent; **no** service fee. |
| **Notifications** | Accept reminder, Start confirmation, window expiring, failure-to-start dismissal. |
| **Admin** | Audit dismissals via existing paths. |
| **Tests** | pgTAP: 24h boundary; idempotent Start; no double `started_at`; dismiss + full lock refund (single + milestone). |
| **Dependencies** | `accept_response`, lock, milestone accept paths (**IMPLEMENTED**). |
| **Unresolved** | None for Start MVP. |

### Phase 0b — Calendar delivery deadline and missed-delivery protection (**PLANNED**, Request engagement)

**Gate:** Phase **0a** must ship first; delivery deadline experience is not complete without universal Start.

| Attribute | Detail |
|-----------|--------|
| **Objective** | **When will you deliver?** on response; adjust deadline on Start; missed-delivery dismissal + mutual extensions. |
| **User outcome** | Calendar picker on respond; creator sees proposal before accept; countdown begins at Start with elapsed shift; dismiss on miss with refunds (remaining locked; milestone **Option B**). |
| **Backend** | **MOD/NEW** `respond_to_request` + proposal fields; **MOD** `accept_response` stores proposal; **MOD** `start_request` computes adjusted deadline, 30-day max from Start; `agree_delivery_extension`; `dismiss_worker_missed_delivery`; audit trail columns. |
| **Wallet** | Missed-delivery refunds; **no** service fee on refunds. |
| **Mobile/PWA** | **MOD** `respond/[id].tsx`, accept UI, engagement; date/time picker (not duration-only). |
| **Notifications** | Deadline approaching, missed delivery, extension agreed/declined. |
| **Admin** | Optional ops view of dismissals. |
| **Tests** | pgTAP: shift math example; 30-day cap from Start; no dismiss before deadline or before Start; milestone Option B; extension mutual + 30-day from Start; Request expiry independence. |
| **Dependencies** | **Phase 0a** (**required**); accept/lock/milestone (**IMPLEMENTED**). |
| **Unresolved** | Qualifying deliverable vs chat (UD-21); optional `scheduled_for` UI (UD-16). |

---

## Phase 1 — Usernames, public profiles, and People search

| Attribute | Detail |
|-----------|--------|
| **Objective** | Safe public identity and People discovery without widening `profiles` RLS. |
| **User outcome** | Users claim a username; others view public profile by handle. |
| **Backend** | **NEW** migrations: `profiles.username` (citext, unique), optional `crown_visible` (if not on `user_reputation`). RPCs: `set_username`, `get_public_profile`, `search_people`. |
| **Database** | Index on normalized username; `guard_profile_columns` updated for server-only fields. |
| **RPCs** | `search_people(p_query, p_limit, p_offset)`; validate reserved words server-side. |
| **Edge Functions** | None |
| **Mobile** | **MOD** `profile/edit.tsx` username; **NEW** public profile route `profile/[username]` or `u/[username]`; `features/profile/public-api.ts`. |
| **PWA** | Incremental after mobile (not blocking Phase 1 gate). |
| **Admin** | View username on user detail; no new permission yet. |
| **Security** | No public `SELECT` on `profiles`; allowlist in definer RPC only. |
| **Tests** | pgTAP: uniqueness, RLS deny cross-user read, search prefix. |
| **Acceptance** | Username uniqueness enforced server-side; public profile shows only allowlisted fields. |
| **Dependencies** | None |
| **Risks** | Handle squatting; rate-limit `set_username`. |
| **Parallelizable** | Request expiry (Phase 0); Reputation schema draft after username design frozen. |

---

## Phase 2 — Dedicated Search and navigation

| Attribute | Detail |
|-----------|--------|
| **Objective** | Search tab; Home decoupled from `q=`; target bottom nav structure. |
| **User outcome** | Tabs: **Home · Search · Create · Wallet · Profile** (replaces Activity + Notifications as primary tabs). Notifications move to header/stack (**UNRESOLVED** exact UX — UD-12). Activity (My Requests / My Responses) relocates to **profile** (full sticky tabs in Phase 9). |
| **Backend** | Reuse `search_requests`; wire `search_people`. Optional `record_*` analytics. |
| **Database** | Optional indexes on username trigram (`pg_trgm`) if approved. |
| **Mobile** | **MOD** `(tabs)/_layout.tsx`: Search + Wallet + Profile tabs; **NEW** `(tabs)/search.tsx` with top tabs (Requests, People; Projects stub); **MOD** `index.tsx` remove `q` feed coupling. |
| **PWA** | **MOD** `HomeTabBar.tsx` when mobile nav stable; follow incrementally. |
| **Admin** | None |
| **Security** | People search only public fields. |
| **Tests** | Mobile query key tests; SQL search limits. |
| **Acceptance** | Searching does not mutate Home feed state; People opens public profile. |
| **Dependencies** | **Phase 1** for People tab |
| **Risks** | Badge migration (waiting responses → profile or notifications). |

---

## Phase 3 — Unified reputation and Crown

| Attribute | Detail |
|-----------|--------|
| **Objective** | Points, tiers, Gold Shield, auditable ledger. |
| **User outcome** | Profile shows Crown, progress, shield; reputation history for self. |
| **Backend** | **NEW** `user_reputation`, `reputation_ledger`, `reputation_config` (thresholds). RPC `apply_reputation_delta` (service/admin), `get_my_reputation`, `list_reputation_history`. |
| **Database** | Idempotency keys on ledger; hooks from completed Requests (**UNRESOLVED** point values — UD-08). |
| **Mobile** | **NEW** `features/reputation/*`; **MOD** `profile/reviews.tsx` and profile header. |
| **PWA** | Incremental after mobile reputation UI. |
| **Admin** | **NEW** reputation adjust UI, audit via `admin_record_audit_event`. |
| **Security** | Client cannot update points. |
| **Tests** | Shield consumption order; Gold demotion/regain. |
| **Acceptance** | Deductions consume Shield first; ledger append-only. |
| **Dependencies** | Phase 1 recommended (public Crown visibility). |
| **Parallelizable** | Premium schema draft (Phase 4). |

---

## Phase 4 — Premium entitlement and trial

| Attribute | Detail |
|-----------|--------|
| **Objective** | **Premium Collaborative** entitlement; server gate for Project creation. |
| **User outcome** | Standard Request flows unchanged; 30-day trial without card; expiry blocks **new** Projects only. |
| **Backend** | **NEW** `user_entitlements`; RPCs `start_premium_trial`, `get_my_entitlements`, `assert_project_creator_premium`. |
| **Mobile** | Trial UX, expiry display, gate Project composer. |
| **PWA** | Incremental; full parity not required until Phase 11. |
| **Admin** | Grant/revoke entitlement, audit. |
| **Tests** | One trial per account; create Project denied when expired. |
| **Acceptance** | Existing Project operations allowed after expiry. |
| **Dependencies** | None for schema; **Phase 5** needs this. |
| **Unresolved** | Paid pricing/provider (UD-13); trial abuse signals (UD-14). |

---

## Phase 5 — Project foundation and creation

| Attribute | Detail |
|-----------|--------|
| **Objective** | Separate Project entity and create flow. |
| **User outcome** | Premium creators configure budget, **minimum funding target**, **minimum contribution**, funding deadline, visibility modes. |
| **Backend** | **NEW** `projects`, `project_tags`, enums; `create_project`, `update_project`, `get_project`. Funding deadline rules per spec §7.3. |
| **Database** | `funding_deadline_at timestamptz`; budget fields; **no assignments** yet. |
| **Mobile** | **NEW** `app/project/new.tsx`, `features/projects/*`. |
| **PWA** | Stub only. |
| **Admin** | Project list/detail read-only. |
| **Tests** | Premium gate; deadline validation; min/max period. |
| **Acceptance** | No row in `requests` for Projects. |
| **Dependencies** | **Phase 4** |
| **Unresolved** | Project visibility **modes** and RLS (UD-01); creator-controlled visibility **settled** in spec. |

---

## Phase 6 — Project funding and contributions

**Gate:** Do **not** start implementation until **per-contribution accounting model** is specified enough to implement refund eligibility (spec §7.5). Proportional allocation **rounding** remains **UNRESOLVED** (UD-19) but **must not** block schema for contribution + reservation attribution design sign-off.

| Attribute | Detail |
|-----------|--------|
| **Objective** | Shared pool, invite-only/public funding modes, lazy funding failure, self-serve refunds with eligible balance. |
| **User outcome** | Contribute (respecting minimum contribution and budget cap); claim refund when unsuccessful; see eligible balance. |
| **Backend** | **NEW** `project_funding_pools`, `project_contributions`, contributor balance columns, `project_funding_invitations`, lazy `evaluate_project_funding_status`; contribute/refund RPCs. |
| **Financial** | `wallet_apply_entry`; pool `FOR UPDATE`; track reserved slice per contribution where design allows. |
| **Mobile** | Funding UI, contributor refund. |
| **Admin** | Finance view of pool and contributions. |
| **Tests** | Overfund prevention; concurrent contributions; refund idempotency; cannot refund reserved slice. |
| **Acceptance** | No auto-refund cron; unsuccessful on lazy eval; **no new assignments** after failure. |
| **Dependencies** | **Phase 5** |
| **Unresolved** | UD-19 allocation/rounding; UD-06 reopen funding; anonymous contributor (UD-03). |

---

## Phase 7 — Assignments, agreements, reservations

| Attribute | Detail |
|-----------|--------|
| **Objective** | Multi-Worker assignments **only after minimum funding target met**; secured compensation before **per-assignment** start. |
| **User outcome** | Create/accept post-minimum; reserve per assignment; Workers **start independently** when secured (+ early-commencement rules). |
| **Backend** | **NEW** `project_assignments`, `project_assignment_terms`, `project_assignment_reservations`; gate RPCs on pool ≥ minimum target; `reserve_assignment_compensation`, `start_assignment`. |
| **Tests** | Assignment blocked below minimum; double reservation; early commencement after minimum only. |
| **Dependencies** | **Phase 6** |
| **Unresolved** | Assignment chat (UD-15) if in MVP. |

---

## Phase 8 — Deliverables, milestones, approvals, payouts, disputes

| Attribute | Detail |
|-----------|--------|
| **Objective** | End-to-end assignment work and money movement. |
| **User outcome** | Submit, revise, approve, get paid; dispute one assignment. |
| **Backend** | Mirror `wallet_release_milestone_kobo` patterns; assignment-scoped problems. |
| **Tests** | Fee 10%; dispute holds payout. |
| **Dependencies** | **Phase 7** |
| **Unresolved** | UD-04 unused funds; UD-05 cancellation mid-Project. |

---

## Phase 9 — Project discovery and profile activity

| Attribute | Detail |
|-----------|--------|
| **Objective** | Search Projects tab; profile activity hub with pagination. |
| **User outcome** | Find Projects; profile sticky tabs: Requests / Responses / Projects. |
| **Backend** | `search_projects`, `list_user_public_activity`, paginated RPCs. |
| **Mobile** | **MOD** profile; **MOD** Search Top/Projects tabs. |
| **PWA** | Partial incremental parity. |
| **Dependencies** | **Phases 1, 2, 5, 7** |
| **Unresolved** | UD-11 Top tab ranking. |

---

## Phase 10 — Admin support and moderation

| Attribute | Detail |
|-----------|--------|
| **Objective** | Operate Projects, refunds, reputation, Premium. |
| **Backend** | Extend `get_my_admin_permissions`; admin RPCs. |
| **Admin** | New dashboard routes. |
| **Dependencies** | **Phases 3–8** as features ship. |

---

## Phase 11 — PWA parity and release preparation

| Attribute | Detail |
|-----------|--------|
| **Objective** | Align PWA with stable mobile/backend features (incremental allowed before this phase). |
| **Dependencies** | Feature-stable mobile per area. |
| **Tests** | `pnpm pwa:test`, manual checklists in `apps/pwa/docs/*`. |

---

## Dependency graph (summary)

```
Phase 0 (Request expiry) ──┬── parallel ──► Phase 2
Phase 0a (Worker Start) ─┼── parallel Phases 1–11 (Request domain)
Phase 0b (delivery/dismiss) ── requires ──► Phase 0a
Phase 1 ──► Phase 2 ──► Phase 9 (People/Search UI)
Phase 3 ──► Phase 9 (Crown on public profile)
Phase 4 ──► Phase 5 ──► Phase 6* ──► Phase 7 ──► Phase 8 ──► Phase 9/10
  * Phase 6 gated on UD-19 before refund RPCs ship
```

**Request engagement completion order:** 0a → 0b (0b not complete without Start + deadline shift).

---

## Operational verification (not product decisions)

| Item | Action |
|------|--------|
| `auto_complete_due_requests` | **Verify** production scheduler; document in runbook (OV-01). |
| CI | No `.github/workflows` in repo — add CI or document external pipeline |

---

## Commands for validation (not run as part of doc authoring)

```bash
pnpm validate          # mobile typecheck + lint + admin + website
pnpm db:test           # pgTAP (requires local Supabase)
pnpm functions:test    # Deno Paystack/NIN tests
pnpm --filter @active/mobile test:milestones
pnpm pwa:test
```