# Active — Existing vs Planned (v1.0.3)

Comparison of **verified repository behavior** against **Active Product Specification v1.0.3**.  
Status key: **IMP** implemented · **PART** partial · **PLN** planned · **MOD** must change existing · **SPEC** specified in product docs, not in code

---

## Applications

| Area | Status | Evidence |
|------|--------|----------|
| Mobile marketplace app | **IMP** | `apps/mobile`, Expo 58, expo-router |
| PWA marketplace | **PART** | `apps/pwa`, gaps in `apps/pwa/docs/marketplace-implementation.md` |
| Admin dashboard | **IMP** | `apps/admin`, users/requests/finance/reports/withdrawals |
| Marketing website | **IMP** | `apps/website` |
| Shared package layer | **N/A** | No `packages/`; duplicated `features/` in mobile/PWA |

---

## Requests (database: `requests`)

| Capability | Status | Notes |
|------------|--------|-------|
| Create with title, description, offer, tags (≤3), photo | **IMP** | `create_request` in `20261117180100_request_milestone_rpcs.sql`; `MAX_REQUEST_TAGS` |
| Predefined tags only | **IMP** | `tags`, `request_tags`, tests in `active.test.sql` |
| Location required at publish | **IMP** | `assert_coordinates` in `create_request` |
| Expiry: Today/Future, default 11:59 PM local, adjustable time | **SPEC** / **MOD** | Repo: `request_expires_at` + 24h interval; UI “When do you need it?” |
| Expiry stored as absolute timestamptz (e.g. Lagos) | **SPEC** / **MOD** | Repo ties expiry to `scheduled_for` + interval |
| Optional work scheduling (`scheduled_for`) separate from expiry | **IMP** (column) / **MOD** (UX) | Conflated in create UI today; UI exposure **UNRESOLVED** (UD-16) |
| Browse / nearby feed | **IMP** | `browse_open_requests`, infinite scroll `HOME_BROWSE_PAGE_SIZE` |
| Search text on Requests | **IMP** | `search_requests`; home `q=` param |
| Respond / counteroffer | **IMP** | `respond_to_request`, `quoted_amount` |
| Pre-handshake chat | **IMP** | Conversation RPCs + Realtime |
| Accept one Worker | **IMP** | `selected_user_id`, `handshakes` |
| Lock payment on accept | **IMP** | `lock_request_escrow_for_amount` |
| Single + milestone payment | **IMP** | `supabase/docs/request-milestone-payments.md` |
| 10% fee from payout | **IMP** | `20261005190000_service_fee_deducted_at_payout.sql` |
| Complete / 72h auto-complete | **IMP** | `completion_confirmation_interval`; **OV-01** scheduler unverified |
| Star reviews | **IMP** | `rate_request` |
| Report / dispute | **IMP** | `service_problems`, admin tools |
| In-app cancel engagement | **N/A** | Reporting/disputes path **IMP** |
| Extend response deadline | **PART** | `extend_request` for **awaiting review** only; general policy **UNRESOLVED** (UD-17) |
| Worker **Start** after accept | **PART** | `start_request` **IMP** — no 24h window, no delivery coupling |
| Start within 24h of accept; reject late Start | **SPEC** / **MOD** | — |
| Failure-to-start creator dismissal + refund (no fee) | **SPEC** / **PLN** | — |
| Worker delivery deadline on respond (“When will you deliver?”) | **SPEC** / **PLN** | Not in `respond_to_request` today |
| Calendar deadline shifts on Start (accept → Start elapsed) | **SPEC** | — |
| 30-day max delivery from **Start** (not accept) | **SPEC** | — |
| Request expiry independent of delivery deadline | **SPEC** | Engagements can outlive expired Request posting |
| Missed-delivery creator dismissal + refund (no fee) | **SPEC** / **PLN** | Distinct from failure-to-start |
| Milestone missed-delivery Option B (keep released) | **SPEC** | — |
| Mutual delivery deadline extension | **SPEC** / **PLN** | 30-day max from Start |
| Deliverable submission vs chat distinction | **SPEC** | Mechanism **UNRESOLVED** (UD-21) |

---

## Wallet and payments

| Capability | Status | Notes |
|------------|--------|-------|
| Kobo wallet + ledger | **IMP** | `wallets`, `wallet_transactions`, `wallet_apply_entry` |
| Paystack deposit | **IMP** | Edge functions, `deposit_transactions` |
| Withdrawal + NIN gate | **IMP** | `wallet_withdrawals`, admin settlement |
| One `payment_locks` per Request | **IMP** | UNIQUE `request_id` |
| Project funding pool + three config fields | **SPEC** | Total budget, min funding target, minimum contribution |
| Assignment gate (no assign before min target) | **SPEC** | — |
| Per-contribution refundable balance / reservations | **SPEC** | Allocation **UNRESOLVED** (UD-19) |
| Contributor refunds (manual claim) | **SPEC** | — |

---

## Profiles and identity

| Capability | Status | Notes |
|------------|--------|-------|
| Display name, bio, avatar | **IMP** | `profiles`, onboarding gate |
| In-app avatar capture | **IMP** | `avatar_captured_in_app`, chat gate |
| Identity verification badge | **IMP** | NIN flow, `user_identity_verifications` |
| Username | **PLN** | No column in `database.types.ts` |
| Public profile route | **PLN** | `PersonProfileBottomSheet.tsx` only |
| Profile activity hub | **PLN** | Activity tab holds My Requests/Responses **IMP** |
| Crown / points | **PLN** | Reviews label only on `profile/reviews.tsx` |
| Crown visibility preference | **PLN** | — |
| Following system | **N/A** | **SPEC:** not in v1.0 |

---

## Search and navigation

| Capability | Status | Notes |
|------------|--------|-------|
| Bottom: Home, Activity, Create, Notifications | **IMP** | `(tabs)/_layout.tsx` |
| Bottom: Home, Search, Create, Wallet, Profile | **SPEC** | Wallet/Profile via stack today |
| Dedicated Search (decoupled from Home) | **PART** / **SPEC** | Modal → Home `q=` |
| Search: People / Projects | **PLN** / **SPEC** | — |

---

## Projects (product spec v1.0.3)

| Capability | Status |
|------------|--------|
| Separate domain (not `requests`) | **SPEC** |
| Parent + pool + assignments + reservations model | **SPEC** |
| Creator allocates pool to assignments | **SPEC** |
| Project visibility creator-controlled | **SPEC** (modes **UNRESOLVED** UD-01) |
| Premium-gated creation | **SPEC** |
| Min funding target vs total budget vs minimum contribution | **SPEC** |
| Assignments blocked until min target | **SPEC** |
| Per-assignment secure + independent Worker start | **SPEC** |
| Early commencement after min target (not before) | **SPEC** |
| Funding deadline Today/Future, 11:59 PM default, shorten only | **SPEC** |
| Funding visibility: invite-only \| public contribution | **SPEC** |
| Funding unsuccessful + lazy eval + contributor refunds | **SPEC** |
| `projects` table in repo | **PLN** (absent from `database.types.ts`) |

---

## Premium

| Capability | Status |
|------------|--------|
| Standard Request marketplace (no Premium) | **IMP** / **SPEC** |
| Premium Collaborative — trial, entitlement, Project create gate | **SPEC** / **PLN** |
| Existing Projects operable after Premium expiry | **SPEC** |

---

## Reputation (Crown)

| Capability | Status | Notes |
|------------|--------|-------|
| Star ratings aggregate | **IMP** | `profiles.rating_*` server-managed |
| Points + Crown + Shield | **SPEC** / **PLN** | Separate from Premium |
| Reputation ledger | **SPEC** / **PLN** | |

---

## Admin

| Capability | Status | Notes |
|------------|--------|-------|
| Users, Requests, reports, finance, withdrawals | **IMP** | `admin_members` |
| Project / refund / reputation / Premium admin | **SPEC** / **PLN** | |
| Auto-complete recovery RPC | **IMP** | `admin_execute_operational_recovery` |

---

## Testing and CI

| Capability | Status | Notes |
|------------|--------|-------|
| pgTAP SQL tests (26 files) | **IMP** | `supabase/tests/` |
| Mobile unit tests (selected) | **IMP** | `package.json` scripts |
| PWA vitest | **IMP** | `pnpm pwa:test` |
| GitHub Actions CI | **NOT FOUND** | **OV-02** |

---

## Discrepancies (spec vs repo)

| Topic | Spec v1.0.3 | Repository today |
|-------|-------------|------------------|
| Request expiry | Absolute `expires_at`, 11:59 PM default, timezone | 24h from post/`scheduled_for` |
| Request create question | “When does it expire?” | “When do you need it?” |
| `scheduled_for` | Must not drive expiry | Drives expiry via `request_expires_at` |
| Worker Start | 24h from accept; delivery at Start | `start_request` anytime from `accepted`; sets `started_at` |
| Delivery deadline | Calendar on respond; shift on Start | Not in response flow |
| Bottom navigation | Search, Wallet, Profile tabs | Activity, Notifications |
| Search | Independent of Home | Home `q=` param |
| Project funding settings | Three separate fields + assignment gate | Not implemented |
| Projects | Separate domain | Not present |
| Auto-complete job | Must run in production | Function only; **OV-01** |

---

## Legend

- **SPEC** = documented product decision in `ACTIVE_PRODUCT_SPEC_V1.md`, not claimed as built.
- Claims tied to paths/migrations above were re-verified at v1.0 authoring; Start/delivery gaps updated at v1.0.3.