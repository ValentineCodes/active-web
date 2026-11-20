# Active — Product and Implementation Reconciliation Plan

**Date:** 2026-11-19  
**Inputs:** `ACTIVE_PRODUCT_SPEC_V1.md`, `ACTIVE_IMPLEMENTATION_PLAN.md`, `ACTIVE_IMPLEMENTATION_ROADMAP.md`, `ACTIVE_EXISTING_VS_PLANNED.md`, `ACTIVE_UNRESOLVED_DECISIONS.md`, `ACTIVE_POST_IMPLEMENTATION_AUDIT.md`, and current repository inspection.

**Principle:** Extend and correct what exists. Do **not** wipe working Request, wallet, milestone, or admin functionality.

**This document does not authorize new product behaviour** where the spec or register marks a decision unresolved.

---

## 1. Preserve / extend / correct

### 1.1 Preserve (regression protection)

| Area | Rationale | Primary evidence |
|------|-----------|------------------|
| Request create → respond → accept → lock → engage → complete | Core marketplace; mature RPCs and UI | `create_request`, `accept_response`, mobile/PWA request flows |
| Milestone payment structure on Requests | Shipped in git history | `2026111718*`, milestone UI |
| Wallet ledger, Paystack deposits, withdrawals, NIN gate | Financial integrity | `wallet_*`, Edge functions |
| Admin users, requests, reports, finance, withdrawals, audit | Operational baseline | `apps/admin`, `202610171*` |
| Browse/search gating on `expires_at` | Spec-aligned behaviour | `browse_*`, `search_requests` |
| Identity verification badge, in-app avatar for chat | Security/product rules | NIN migrations, chat gates |
| `payment_locks` per Request (not for Projects) | Spec: separate Project pool | UNIQUE `request_id` on locks |

### 1.2 Extend (build on partial work)

| Area | Current state | Extend with |
|------|---------------|-------------|
| Bottom nav → Home · Search · Create · Wallet · Profile | **PART** — Search tab in uncommitted mobile/PWA; Notifications still tab; no Wallet/Profile tabs | Add Wallet + Profile tabs; relocate Notifications (UD-12); keep Activity routes, not tab |
| Dedicated Search (`search_discover`) | **PART** — mobile `search.tsx`, PWA `SearchPage.tsx`; no pagination/deep links | Pagination, entity navigation, loading/empty/error |
| Usernames + public profile | **PART** — RPCs + mobile `/u/[username]`, edit username | PWA public profile; People result navigation |
| Worker Start + deadlines (Requests) | **PART** — SQL + mobile engagement; PWA Start only | PWA parity: lifecycle card, dismiss, respond delivery picker |
| Project domain (SQL) | **CV** on pgTAP — no client product | Full creator + Worker + contributor apps |
| Premium trial + entitlements | **PART** — `get_my_entitlements`, trial columns | Trial UX, create gate, reminders |
| Crown foundations | **PART** — ledger, config (shield 10), `set_my_crown_public` default true | Presentation UI, privacy toggle, no auto points (UD-08–10) |
| Admin Project oversight | **PART** — uncommitted routes/RPCs | Commit, read-only until UD-19 refunds |

### 1.3 Targeted corrections (do not rebuild)

| Issue | Classification | Correction |
|-------|----------------|------------|
| Request create copy **“When do you need it?”** conflates scheduling with expiry | **Requires correction** vs spec §3.4 | **MOD** `apps/mobile/app/request/new.tsx`, PWA create: **“When does it expire?”**; explicit `expires_at`; separate optional `scheduled_for` (UD-16) |
| Server still ties expiry to `scheduled_for` + interval in legacy paths | **Requires correction** | **MOD** `create_request` overloads per Phase 0 roadmap; pgTAP |
| Bottom nav ≠ spec (Notifications tab, no Wallet/Profile) | **Requires correction** | **MOD** `(tabs)/_layout.tsx`, `_layout.web.tsx`, PWA `HomeTabBar.tsx` |
| Create tab → request-only composer | **Requires correction** | **NEW** bottom sheet: Request \| Project |
| Settings scattered on `profile/index.tsx` | **Requires correction** | **NEW** dedicated Settings screen; profile header → Settings |
| Profile = settings list, not social activity hub | **Requires correction** | **NEW** Twitter/X-*style* layout (Active branding): collapsing header, sticky tabs, infinite feed |
| `admin_apply_reputation_delta` was service_role-only | **Already corrected** in uncommitted migration | Ensure merged; super_admin via dashboard |
| Request lifecycle pgTAP files broken/failing | **Requires correction** | Fix test SQL; re-verify RPCs |
| `ACTIVE_EXISTING_VS_PLANNED.md` stale | **Documentation** | Update after slices land |

---

## 2. Product area reconciliation (A–K)

### A. Main navigation

| Item | Classification | Current implementation | Gap / target |
|------|----------------|-------------------------|--------------|
| Home · Search · Create · Wallet · Profile | **Confirmed** (spec §5.2) | Uncommitted: Search tab; **Committed git:** Home, Activity, Create, Notifications | Replace Activity/Notifications tabs with Search, Wallet, Profile |
| Activity inside Profile | **Confirmed** | `/(tabs)/activity` exists; profile links “My activity” | Activity hub becomes Profile sub-tabs (Requests, Responses, Projects) |
| Search not Home `q=` | **Confirmed** | Uncommitted: decoupled Home | Complete on PWA; remove legacy `app/search.tsx` modal pattern if obsolete |
| Notifications placement | **Unresolved** (UD-12) | Still a tab in committed layout | Interim: header bell (spec assumption); not invented here |

**Mobile:** `apps/mobile/app/(tabs)/_layout.tsx`, `_layout.web.tsx`, `create-tab-return.ts`  
**PWA:** `HomeTabBar.tsx`, `AppShell.tsx`  
**Admin / website:** N/A

---

### B. Create experience

| Item | Classification | Current | Target |
|------|----------------|---------|--------|
| Bottom sheet: Request \| Project side-by-side | **Confirmed** (user reconciliation prompt) | Create tab → `request/new` only (`create.tsx`) | **NEW** sheet component; two destinations |
| Separate creation flows | **Confirmed** | Request: `request/new.tsx` | **NEW** `project/new` (or wizard) — no combined form |
| Request ≤3 predefined tags | **Already implemented** | `MAX_REQUEST_TAGS` / create validation | Preserve |
| Project unlimited tags from catalogue | **Confirmed** (prompt); **verify** server max | `create_project(p_tag_ids uuid[])` no 3-cap in `20261124120000` | UI multi-select; document server-side sanity cap if needed (not inventing policy) |

**Backend:** `create_project`, `create_request` — exist  
**PWA:** `CreateComposerProvider` — **MOD** for Project branch

---

### C. Request creation

| Item | Classification | Current | Target |
|------|----------------|---------|--------|
| “When does it expire?” Today/Future, 11:59 PM default, timezone | **Confirmed** (spec §3.4) | UI still “When do you need it?”; legacy expiry math | Phase 0 MOD per roadmap |
| Expiry ≠ delivery deadline ≠ optional schedule | **Confirmed** | SQL partially updated (uncommitted migrations); UI conflated | Explicit fields in UI + RPC |
| General expiry extension | **Unresolved** (UD-17) | `extend_request` awaiting-review only | No invented extension |
| Optional `scheduled_for` in create UI | **Unresolved** (UD-16) | Partial exposure | Defer or isolate |

**Database:** May need migration only if `create_request` not fully updated in uncommitted work — verify before new migration.  
**Tests:** `request_*` pgTAP — repair first.

---

### D. Collaborative Projects

Roles (terminology):

| Role | Meaning | In code |
|------|---------|---------|
| **Creator** | Owns Project, invites, allocates pool to assignments | `projects.creator_id` |
| **Contributor** | Funds the pool | `project_contributions` |
| **Worker** | Assigned to deliver; **not** called Provider | `project_assignments.worker_id` |
| **Provider** | Reserve for payment-provider / marketplace language elsewhere — **do not** label Workers as Providers in Project UI |

| Capability | Classification | Backend (uncommitted migrations) | Mobile | PWA | Admin |
|------------|------------------|-----------------------------------|--------|-----|-------|
| Create Project | **Confirmed** + Premium gate | `create_project`, trial on profile | **MISS** | **MISS** | N/A |
| Discovery / details | **PART** / **BLOCK** UD-01 | `get_project`, `search_projects` (interim public funding) | Search list only | Search list only | `admin_list_projects` |
| Funding progress, pool, contributions | **Confirmed** | Pool tables, contribute RPCs | **MISS** | **MISS** | Read-only detail |
| Contributor refund claim | **BLOCK** UD-19 | Stub `claim_project_contribution_refund` | **MISS** | **MISS** | Note in admin |
| Invitations, funding visibility | **Confirmed** spec §7.8 | Schema exists | **MISS** | **MISS** | — |
| Assignments: create, accept, terms, reserve, start | **Confirmed** | `20261126120000_*` | **MISS** | **MISS** | List on admin project |
| Deliverables, milestones, approve, payout, disputes | **Confirmed** | `20261127120000_*` | **MISS** | **MISS** | Disputes list |
| Project activity feed / status | **Confirmed** | Partial via `get_project`, no public activity RPC | **MISS** | **MISS** | — |
| Funding unsuccessful, closure | **PART** / **BLOCK** UD-04/05/06 | Lazy evaluate | **MISS** | **MISS** | — |

**Creator journey (to build):** Premium check → create → open funding → invite (if invite-only) → assignments → allocate/reserve → monitor contributions → approve payouts.  
**Worker journey:** Discover/invite → assignment terms → accept → reserve → start → submit → revise → milestone approve.  
**Contributor journey:** Discover → contribute → accounting view → claim refund (when UD-19).

**Preserve:** Request `payment_locks` pattern — **do not** attach Projects to request locks.

---

### E. Username and public profiles

| Item | Classification | Current | Target |
|------|----------------|---------|--------|
| Unique username, `set_username` | **Already implemented** (SQL) + **PART** mobile edit | `20261128120000_*`, `profile/edit.tsx` | PWA edit |
| `get_public_profile` allowlist | **Already implemented** | RPC | Enrich UI |
| People search | **PART** | `search_people`, Search tab | Tap → `/u/[username]` |
| No public `profiles` SELECT | **Confirmed** | RLS unchanged | Preserve |
| Phone / wallet on public profile | **Confirmed** must not expose | RPC enforced | Preserve |

---

### F. Twitter/X-style Profile (Active branding)

| Item | Classification | Current | Target |
|------|----------------|---------|--------|
| Prominent header, collapse on scroll | **Confirmed** (spec §4.4) | Flat `profile/index.tsx` settings-heavy | **NEW** profile shell |
| Infinite activity feed | **Confirmed** | My lists via `useMyRequests` / `useMyResponses` only on Activity tab | **NEW** paginated RPCs (e.g. `list_user_public_activity` — **not in repo**) |
| Sticky tabs: Requests, Responses, Projects | **Confirmed** | Activity top tabs: Requests/Responses only | Add Projects tab; move under Profile |
| Settings via header, not bottom nav | **Confirmed** | Settings on profile scroll | Dedicated Settings route |
| Public vs own profile | **Confirmed** | Own profile stack; `/u/[username]` basic | Unify patterns |

**Classification note:** “Twitter/X-style” is **Previously proposed** interaction pattern; **Confirmed** in spec §4.4 as activity hub behaviour, not branding copy.

---

### G. Dedicated Settings

| Item | Classification | Current | Target |
|------|----------------|---------|--------|
| Single Settings screen | **Confirmed** | Split: `notification-settings`, profile groups, theme inline | Consolidate |
| Account: edit profile, username, locations, bank, identity | **Already implemented** scattered | `profile/edit`, `locations`, `bank-accounts`, NIN flows | Move links under Settings |
| Notifications | **Already implemented** | `/notification-settings` | Keep; link from Settings |
| Privacy: Crown visibility | **PART** — RPC only | `set_my_crown_public` | Toggle in Privacy section |
| Privacy placeholder (empty) | **Requires correction** | `Privacy` `onPress={() => {}}` | Wire Crown + any approved toggles only |
| Appearance / theme | **Already implemented** | On profile today | Move to Preferences in Settings |
| Security | **Unresolved** what beyond NIN/session | — | Only expose existing behaviours |
| Wallet config | **Already implemented** | Wallet stack | Link from Settings optional |
| Help, report, about placeholders | **PART** | Non-functional rows | Implement or remove until supported |

---

### H. Dedicated Search

| Item | Classification | Current | Target |
|------|----------------|---------|--------|
| Categories: Top, Requests, People, Projects | **Confirmed** | Wired via `search_discover` (uncommitted) | Pagination (`p_offset`), entity routes |
| Top ranking | **Unresolved** (UD-11) | Returns `deferred_ud_11` | No invented weights |
| Project discovery | **BLOCK** UD-01 | Interim public-funding only | Document in UI |
| Loading / empty / error | **PART** | Basic text states | Skeleton + error retry |
| Filters | **Unresolved** beyond text query | — | Do not invent |

**Backend:** `search_discover`, `search_people`, `search_projects`, `search_requests` — exist.

---

### I. Crown and reputation

| Item | Classification | Current | Target |
|------|----------------|---------|--------|
| Unified conduct-based points | **Confirmed** | `user_reputation`, `reputation_ledger` | UI + admin adjust only until UD-08–10 |
| Points up/down | **Confirmed** | Ledger + admin delta | No client-side points |
| Gold cap 50, Shield 10 | **Confirmed** (spec §10) | `reputation_config` defaults **10** shield | **Do not change 10** |
| Crown public default **show** | **Confirmed** | `crown_public DEFAULT true` | Privacy toggle off |
| Separate from Premium | **Confirmed** | Distinct columns/RPCs | Preserve |
| Automated point rules, appeals | **Unresolved** UD-08–10 | Admin-only deltas | No auto hooks |
| Crown presentation assets | **Confirmed** spec §10 | Website Gold asset | Mobile/PWA meters — **PLANNED** |

---

### J. Premium

| Item | Classification | Current | Target |
|------|----------------|---------|--------|
| 30-day trial, no card | **Confirmed** | SQL trial start on first project create path | Trial start UX + messaging |
| Creator-only Premium for new Projects | **Confirmed** | `get_my_entitlements().can_create_projects` | Enforce in create Project UI |
| Existing Projects after expiry | **Confirmed** | Documented SQL behaviour | No client block on operate |
| Paid conversion | **Unresolved** UD-13 | — | Do not build checkout |

---

### K. Application-wide UI states

| Surface | Skeleton / empty / error today | Target |
|---------|-------------------------------|--------|
| Home feed | **REG** — `showQuerySkeleton`, `EmptyState` | Preserve; extend consistency |
| Search | **PART** — minimal | Add skeleton rows per category |
| Requests / engagement | **REG** / **PART** | Preserve milestone/engagement patterns |
| Projects | **MISS** | Apply same `StateView` patterns when built |
| Profile / activity feed | **PART** | Collapsing header + tab skeletons |
| Wallet | **REG** | Preserve |
| Settings | **MISS** dedicated screen | Standard layout |
| Notifications | **REG** | Preserve |

---

## 3. Complete feature inventory (summary matrix)

| # | Feature | Status | Classification |
|---|---------|--------|----------------|
| 1 | Request marketplace core | **Already implemented** | Confirmed — **REG** |
| 2 | Request expiry UX (Today/Future) | Partial SQL / wrong UI copy | **Requires correction** |
| 3 | Worker Start 24h + dismiss failure | Partial mobile/SQL | **Implemented but not fully verified** |
| 4 | Delivery deadline + dismiss miss + extensions | SQL partial, UI gaps | **Partially implemented** / tests failing |
| 5 | Project SQL domain | pgTAP green | **Already implemented** (backend) |
| 6 | Project client product | None | **Missing** |
| 7 | Search tab + discover RPCs | Uncommitted partial | **Partially implemented** |
| 8 | Username + public profile | Partial | **Partially implemented** |
| 9 | Profile activity hub + social layout | Activity tab only | **Missing** (spec **Confirmed**) |
| 10 | Nav 5-tab + Create sheet | Wrong tab set | **Requires correction** |
| 11 | Settings consolidation | Scattered | **Requires correction** |
| 12 | Premium trial + entitlements | SQL only | **Partially implemented** |
| 13 | Crown UI + auto rules | Foundations only | **Partial**; auto **Unresolved** |
| 14 | Admin Project/trust | Uncommitted | **Partially implemented** |
| 15 | Operational scheduler local | Wired | **Implemented** local only (OV-01) |

---

## 4. Missing screens and interactions (prioritized)

### Mobile (primary)

1. `(tabs)/wallet.tsx` or wallet tab route  
2. `(tabs)/profile.tsx` — social profile shell (replace stack-only entry)  
3. Create bottom sheet — Request | Project  
4. `project/*` — create, detail, funding, contribute, assignments, worker flows  
5. `settings/index.tsx` — consolidated settings  
6. Profile — collapsing header, tabs (Requests, Responses, Projects), infinite lists  
7. Search — pagination, navigation to `request/[id]`, `/u/[username]`, `project/[id]`  
8. Crown privacy + presentation on profile/settings  
9. Premium trial / upgrade messaging (no payment)  
10. Request create — expiry pickers (correct copy)

### PWA

1. Tab bar parity (5 tabs)  
2. Project flows — **defer** after mobile or thin read-only discovery  
3. Engagement dismiss + proposed delivery on respond  
4. Public profile + username edit  
5. Settings consolidation  

### Admin

1. Commit Project/trust panels (uncommitted)  
2. No new scope until client Project flows stable  

### Website

Marketing only — **no change** required for marketplace reconciliation.

---

## 5. Backend dependencies (existing vs new)

### Already present (uncommitted migrations — commit before client work)

| Dependency | Migrations / RPCs |
|------------|-------------------|
| Request Start / dismiss / deadlines | `20261120120000`, `20261121120000`, `20261122120000`, `20261123120000` |
| Projects funding → delivery | `20261124120000` → `20261127120000` |
| Identity, search, premium, crown | `20261128120000` |
| Admin project + funding evaluate | `20261129120000` |

### Likely NEW before profile hub GA

| RPC / schema | Purpose | Blocked? |
|--------------|---------|----------|
| `list_user_activity` / paginated variants | Profile infinite feed | Product detail: own vs public visibility |
| `list_my_projects` / `list_user_projects` | Projects profile tab | No — can derive from `projects` + RLS/RPC pattern |
| Project detail discovery RPC polish | UD-01 visibility matrix | **BLOCK** full public |
| Contributor refund completion | UD-19 | **BLOCK** production refunds |

### Database changes — avoid duplicate migrations

- **Do not** re-add `username`, pool, assignments if uncommitted files merge.  
- **MOD** `create_request` only if audit shows expiry still wrong after commit.  
- **No** new Crown shield capacity — use config `gold_shield_capacity` = 10.

---

## 6. Mobile / PWA / Admin scope split

| Workstream | Mobile | PWA | Admin |
|------------|--------|-----|-------|
| Navigation 5-tab | **Lead** | Follow | — |
| Create sheet | **Lead** | Follow | — |
| Request expiry correction | **Lead** | Follow | — |
| Request engagement parity | **Lead** | Catch-up | Read-only |
| Project E2E | **Lead** | Phase 2 thin | Oversight only |
| Search | **Lead** | Parity | — |
| Profile + activity hub | **Lead** | Later | — |
| Settings | **Lead** | Follow | — |
| Premium / Crown UX | **Lead** | Minimal | Super_admin adjust (done SQL-side) |
| Contributor refunds | — | — | View only until UD-19 |

---

## 7. Dependencies and sequencing

```
[0] Commit + stabilize uncommitted migrations & fix request pgTAP tests
    │
[1] Navigation + Settings shell (no product blockers)
    │
[2] Request expiry UI/RPC correction (Phase 0) — parallel with [1]
    │
[3] Create sheet + Request path (preserve tags) — after [1] tab Create stable
    │
[4] Search completion (pagination, deep links) — UD-11 stub acceptable
    │
[5] Username/public profile PWA + search People links — after [4]
    │
[6] Premium trial UX + get_my_entitlements gate
    │
[7] Project create → fund → contribute (creator + contributor) — after [6]; UD-01 interim discovery OK
    │
[8] Project assignments + worker flows — after [7]; UD-20 for early commencement UI
    │
[9] Profile social shell + migrate Activity tabs — can start after [1], full feed RPCs may trail [7]
    │
[10] Crown presentation + privacy toggle — after reputation row ensured
    │
[11] PWA engagement parity (Start, dismiss, respond delivery) — after [2]/[3] backend verified
    │
[12] UD-19 refund RPC + contributor UI — **external approval gate**
```

**Parallel safe:** [1]+[2], Admin commit of [0], local ops scheduler (done).

---

## 8. Unresolved decisions (implementation impact)

| ID | Affects |
|----|---------|
| **UD-01** | Project visibility, search Projects GA |
| **UD-19** | Contributor refunds |
| **UD-04, UD-05, UD-06** | Project closure, unsuccessful funding UX |
| **UD-08–10** | Automated Crown |
| **UD-11** | Search Top ranking |
| **UD-12** | Notifications chrome |
| **UD-13** | Paid Premium |
| **UD-16, UD-17** | Request schedule field + expiry extension |
| **UD-20** | Early commencement when disabled |
| **UD-21** | Missed dismiss vs deliverable quality |
| **OV-01** | Production cron (local only today) |

---

## 9. Recommended targeted changes (no code in this pass)

### Repository hygiene (first)

1. Commit migration stack `20261120120000`–`20261129120000` + pgTAP in logical slices.  
2. Fix `request_start_and_failure_dismiss.test.sql`, `request_delivery_deadlines.test.sql`, `request_missed_delivery_dismiss.test.sql`.  
3. Sync `ACTIVE_EXISTING_VS_PLANNED.md` with this plan.

### Product corrections (highest user-visible delta)

1. **Navigation:** Implement 5-tab bar; demote Activity and Notifications per spec.  
2. **Create:** Bottom sheet with Request \| Project.  
3. **Request new:** Expiry question + API alignment.  
4. **Profile:** New shell + move Activity; Settings screen.  
5. **Search:** Finish wiring + pagination; no ranking invention.

### Project (after Premium gate UX)

1. Creator: create → open funding → manage assignments.  
2. Worker: assignment inbox → accept → start → deliver.  
3. Contributor: discover → contribute → accounting (refund UI **blocked** UD-19).

### Do **not** do yet

- Paid Premium, auto Crown points, full Project visibility, proportional refund math, Search Top algorithm, wiping milestone/Request flows.

---

## 10. Risk register

| Risk | Mitigation |
|------|------------|
| Large uncommitted tree lost | Commit slices per §9 |
| Mobile typecheck failures block `pnpm validate` | Fix or scope validate to changed packages |
| Duplicate Search implementations (modal `app/search.tsx` vs tab) | Remove/redirect modal after tab GA |
| Conflating Contributor with Worker in copy | Use spec terms in all Project UI |
| Shield capacity drift | Single source: `reputation_config.gold_shield_capacity` = 10 |

---

## 11. Success criteria (reconciliation “done”)

- Bottom nav matches spec; Activity lives under Profile with three tabs.  
- Create sheet splits Request and Project; Request tags ≤3; Project tags multi-select from catalogue.  
- Request create uses approved expiry model; delivery deadline remains on respond/engagement path.  
- Project creator and Worker paths callable from UI with backend RPCs (refunds still stubbed if UD-19 open).  
- Search categories work with honest empty/loading/error and UD-11 deferred Top.  
- Username + public profile + People discovery linked.  
- Settings consolidated; Crown default visible with hide option.  
- Premium trial gates **new** Project creation only.  
- pgTAP: project + phase9 + fixed request lifecycle suites green.  

---

*Planning document only. No application code was modified in producing this reconciliation plan.*