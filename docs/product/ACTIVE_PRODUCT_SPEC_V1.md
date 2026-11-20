# Active Product Specification v1.0.3

**Status:** Authoritative product reference for implementation planning.  
**Last verified against repository:** 2026-11-19 (read-only inspection).  
**Audience:** Engineers, designers, AI coding agents, operations.

---

## Document legend

| Label           | Meaning                                                           |
| --------------- | ----------------------------------------------------------------- |
| **IMPLEMENTED** | Exists in the repository today (code, migrations, or UX).         |
| **MODIFY**      | Exists but must change to meet v1.0.                              |
| **PLANNED**     | Decided in this specification; not implemented.                   |
| **UNRESOLVED**  | Requires product decision (see `ACTIVE_UNRESOLVED_DECISIONS.md`). |

Database table names such as `requests` may remain unchanged. Product copy and this document use **Request** (not “Task”).

---

## 1. Product identity

**Name:** Active

**Tagline:** **Get help or Get paid.**

Active is a Nigerian marketplace where people find help, earn money, organize collaborative Projects, contribute resources, and build reputation through conduct.

**Primary creation types:**

1. **Requests** — individual work postings (one Request creator, one selected Worker per engagement).
2. **Projects** — collaborative undertakings with multiple Workers, assignments, and optional community funding (**PLANNED**).

**Account roles:** There are **no** permanent “requester” or “Worker” account types. The same user may create Requests, respond to others’ Requests, join Project assignments, and contribute to Project funding.

**Currencies:** Production wallet and Request offers use **NGN**; authoritative balances are stored in **integer kobo** on the server (`wallets` table, migration `20261005120000_production_wallet_schema.sql`).

---

## 2. Repository context (verified)

| Application | Path                                                          | Role                                                      |
| ----------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| Mobile      | `apps/mobile`                                                 | Primary Expo (~58) app, expo-router                       |
| PWA         | `apps/pwa`                                                    | Vite/React PWA, feature parity partial                    |
| Admin       | `apps/admin`                                                  | Next.js 15 operations dashboard                           |
| Website     | `apps/website`                                                | Marketing site                                            |
| Backend     | `supabase/migrations`, `supabase/functions`, `supabase/tests` | Postgres RPCs, RLS, Edge Functions (Paystack, NIN, banks) |

There is **no** shared `packages/` library; mobile and PWA duplicate feature modules (e.g. `browse-api.ts`, `responses-api.ts`).

Supporting technical analysis from Phase 0 architecture validation is consistent with the codebase where cited below; this specification **re-verifies** critical claims.

---

## 3. Requests (individual marketplace)

### 3.1 Scope

**Preserve** the existing Request domain (`public.requests` and related objects). **PLANNED** work must not overload `selected_user_id`, `request_responses`, or `payment_locks` (unique per `request_id`) for Projects.

### 3.2 Lifecycle (**IMPLEMENTED**)

High-level flow (server-enforced via SECURITY DEFINER RPCs):

1. **Create** — `create_request` (`20261117180100_request_milestone_rpcs.sql`): title, description, location, offer, optional `scheduled_for`, tags, optional milestone plan, optional attachment.
2. **Discover** — `browse_open_requests`, `browse_nearby_requests`, `search_requests` (location-aware).
3. **Respond** — `respond_to_request` with optional message and `quoted_amount` (counteroffer), plus mandatory **proposed delivery deadline** (**PLANNED** — see §3.9).
4. **Pre-accept chat** — `open_pre_handshake_conversation`, `request_conversations` / `request_messages` (Realtime on `request_messages`, migration `20261006140000_request_conversations.sql`).
5. **Accept** — `accept_response`: sets `selected_user_id`, creates `handshakes`, locks escrow via `lock_request_escrow_for_amount` (`20261009190000_lock_request_funding_on_accept.sql`). Records **acceptance timestamp**; does **not** start the delivery countdown (§3.9–3.10).
6. **Start** — Worker presses **Start** within **24 hours** of acceptance (**PLANNED** rules on existing `start_request` — §3.9). Delivery deadline is calculated at Start (§3.10). Then work, `mark_service_complete` → `completion_pending`.
7. **Confirm** — `complete_request` by Request creator, or **auto-complete** after confirmation window (see §3.8).
8. **Rate** — `rate_request` only when `status = completed` (`20261001280000_bidirectional_request_ratings.sql`).
9. **Problems** — `report_service_problem`, `contest_service_problem`, admin resolution via `service_problems` / `dispute_admin_resolutions`.

**No in-app engagement cancellation UI** on mobile/PWA today; issues are handled through reporting/disputes (**IMPLEMENTED** product behavior).

### 3.3 Request creation UI and validation

| Field       | Spec v1.0                                             | Current (**IMPLEMENTED** / **MODIFY**)                                                                                                                              |
| ----------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title       | Required, 3–50 chars (create UI); DB allows up to 120 | **MODIFY** copy/limits alignment: `CREATE_TITLE_LIMITS.max = 50` in `apps/mobile/src/config.ts`; DB `create_request` checks 3–120                                   |
| Description | Required, max 1,000                                   | **IMPLEMENTED** — `DESCRIPTION_LIMITS`, RPC validation 1–1000 in latest `create_request`                                                                            |
| Offer       | Required positive amount                              | **IMPLEMENTED** — `REQUEST_REQUIRES_FUNDING = true` in config                                                                                                       |
| Tags        | Optional, **max 3**, predefined catalogue only        | **IMPLEMENTED** — `MAX_REQUEST_TAGS = 3`, `search_tags`, `tags` table; no custom tags                                                                               |
| Image       | Optional                                              | **IMPLEMENTED** — `request-media` storage, `p_attachment_path` on create                                                                                            |
| Location    | Required to **publish**; not at app launch/onboarding | **IMPLEMENTED** — location collected in create flow before RPC; `create_request` calls `assert_coordinates`. Onboarding does not require location (**IMPLEMENTED**) |

Tags must remain **predefined and searchable**. **Do not** add custom tags or ML inference.

### 3.4 Request expiry and optional work scheduling (**MODIFY**)

**Product decision (v1.0):** Creation asks **“When does it expire?”** — not “When do you need it?”

| Choice          | Behavior                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| **Today**       | Default expiry **11:59 PM** on the publish day in the creator’s timezone |
| **Future date** | Creator selects a date; default expiry **11:59 PM** on that date         |

**Time:** The creator may **change the expiry time** (not only the date), provided the resulting **expiry is in the future**. Persist **`expires_at` as an absolute `timestamptz`** computed in the creator’s applicable timezone. For the Nigerian market, use **`Africa/Lagos`** where appropriate. **Do not** derive expiry by adding fixed 24-hour intervals.

Rules:

- After expiry, Request is **not open for new responses** (browse/search gates use `expires_at > now()` — **IMPLEMENTED**).
- Creator can still **view** expired Request (**IMPLEMENTED**).
- Expiry must **not** cancel accepted engagements or invalidate payment obligations (**IMPLEMENTED** — acceptance blocked when expired; engagements independent).

**Separation (settled):** Request **expiry** is **not** work scheduling. The schema has optional `scheduled_for` (**IMPLEMENTED**). v1.0 must **not** silently repurpose `scheduled_for` as the response deadline.

- **`expires_at`** — user-chosen response deadline (absolute timestamp).
- **`scheduled_for`** — optional “when work is expected” (**UNRESOLVED** whether this remains visible in the create UI; see `ACTIVE_UNRESOLVED_DECISIONS.md`).

**Extension policy:** **UNRESOLVED** — no general Request expiry extension policy is approved in v1.0. **IMPLEMENTED** today: `extend_request` only for **awaiting review** (`20261010130100_manual_request_awaiting_review.sql`). Do not invent a maximum expiry horizon.

**Current implementation (discrepancy):**

- UI copy: **“When do you need it?”** — `apps/mobile/app/request/new.tsx`.
- `whenMode` `now` / `later` sets `p_scheduled_for`, conflating scheduling with expiry.
- Server: `expires_at := request_expires_at(p_scheduled_for)` with **`request_lifetime_interval()` = 24 hours** (`20260930000200_functions.sql`).

**Required changes:** **MODIFY** create flows and `create_request` (or companion helper) to accept explicit expiry timestamp; stop tying expiry to `scheduled_for + interval`. Add tests in `supabase/tests/`.

### 3.5 Payments (**IMPLEMENTED**)

- **Lock timing:** Escrow locks when creator **accepts** a Worker, not at post (`lock_request_escrow_for_amount`).
- **10% service fee:** Deducted from offer at payout, not added on top — `compute_request_charge` (`20261005190000_service_fee_deducted_at_payout.sql`). Client mirror: `SERVICE_FEE_RATE = 0.1` in `apps/mobile/src/config.ts`, `summarizeRequestFunding` in `funding.ts`.
- **Milestone Requests:** **IMPLEMENTED** — `payment_structure` `single` \| `milestone`, 2–5 milestones, sum equals offer, full lock at accept, sequential approval, partial release via `wallet_release_milestone_kobo` (`supabase/docs/request-milestone-payments.md`). `mark_service_complete` / `complete_request` / `auto_complete_request` **reject** milestone engagements.
- **Revisions:** Unlimited milestone revisions via `request_engagement_milestone_revision` pattern (**IMPLEMENTED**); no auto-approval.
- **Immutability:** Funded terms change only through recorded mutual agreement (milestone proposals / quoted amounts) (**IMPLEMENTED**).

### 3.6 Reviews (**IMPLEMENTED**)

- Star ratings 1–5, optional comment, bidirectional per completed Request.
- **Separate** from Crown points (**PLANNED** reputation does not replace stars).

### 3.7 Disputes (**IMPLEMENTED**)

- In-request `service_problems`; disputed payment status blocks auto-complete (`auto_complete_due_requests` excludes `payment_status = disputed`).
- Funds remain held until admin resolution (admin dashboard: `apps/admin` reports/finance).

### 3.8 Auto-completion (**IMPLEMENTED**, ops caveat)

- `completion_confirmation_interval()` = **72 hours** (`20260930000200_functions.sql`).
- After helper marks complete, creator has until `completion_confirm_by` to confirm or dispute; else `auto_complete_request` releases payment.
- Batch: `auto_complete_due_requests` (**service_role** only).
- **No `cron.schedule` for auto-complete** found in migrations (only retired engagement-cancellation cron). Admin operational recovery can run `auto_complete_request` (`20261017170000_admin_operations.sql`).
- **Do not** extend 72h auto-complete to Project assignments without explicit product decision (**settled:** not automatic for Project milestones).

### 3.9 Universal Worker Start (**MODIFY** — extends **IMPLEMENTED** `start_request`)

After the creator **accepts** a Worker, every accepted Request engagement requires an explicit **Start** action by the Worker — **single-payment**, **milestone**, and any other supported Request payment structure.

| Rule | Detail |
|------|--------|
| Who starts | **Worker** only (selected Worker), via server-authoritative **Start** |
| Window | Worker has **24 hours** from the **acceptance timestamp** to press Start |
| Start timestamp | First successful Start records **`started_at`** (actual engagement start); repeated taps are **idempotent** and **must not** reset Start |
| Late Start | Backend **rejects** Start after the 24-hour window expires |
| Delivery countdown | Does **not** begin at response submission or acceptance; begins when Worker **successfully Start**s (§3.10) |
| Payment lock | Escrow remains locked on acceptance as today (**IMPLEMENTED**); Start does not change lock amount |

**Repository today:** `start_request` sets `status = in_progress` and `started_at = now()` for `accepted` → `in_progress`, with idempotent return if already `in_progress` — **no 24-hour window**, **no delivery-deadline coupling**, **no failure-to-start dismissal** (`20260930000200_functions.sql`).

### 3.10 Calendar-based delivery deadline (**PLANNED**)

**Field label (response flow):** **When will you deliver?**

| Rule | Detail |
|------|--------|
| Input | **Required** calendar **date/time picker** on every Worker response — **not** duration-only or preset duration chips as the primary input |
| On respond | Proposed delivery must be **in the future** at response submission (server-validated) |
| Creator UX | Creator **must see** the proposed calendar deadline **before** accepting |
| On accept | Acceptance **does not** begin the delivery countdown; store **proposed delivery deadline**, **acceptance timestamp**, and timezone context |
| On Start | Compute **adjusted delivery deadline** = proposed deadline **+** elapsed time between acceptance and Start |

**Adjustment example (settled):**

- Proposed delivery: Friday 5:00 PM  
- Creator accepts: Monday 10:00 AM  
- Worker presses Start: Tuesday 8:00 AM  
- Adjusted delivery deadline: **Saturday 3:00 PM** (same elapsed shift applied to the calendar instant)

| Rule | Detail |
|------|--------|
| Maximum window | Adjusted deadline must be **≤ 30 days** after the **actual Start timestamp** (revalidate on server at Start) |
| Binding terms | Final adjusted deadline is part of **engagement terms** after Start |
| Audit trail | Persist: original proposed deadline, acceptance timestamp, Start timestamp, final adjusted deadline, applicable timezone (e.g. **`Africa/Lagos`**) |

**Repository today:** `respond_to_request` has no delivery-deadline field (**not implemented**).

**Independence from Request expiry (settled):**

| Concept | Scope |
|---------|--------|
| **Request `expires_at`** | Stops **new responses** only |
| **Delivery deadline** | Governs Worker performance **after Start** |
| Accepted engagement | Remains active even if the original Request has **expired** |
| Timing | Delivery deadline may be **later than** Request expiry |
| Expiry | Request expiry **never** auto-terminates an accepted engagement |

### 3.11 Failure to start — creator dismissal (**PLANNED**)

Distinct from missed delivery (§3.12).

If the Worker has **not** pressed Start within **24 hours** of acceptance, the creator may **dismiss** the Worker for failure to start.

| Rule | Detail |
|------|--------|
| Availability | Only after the 24-hour Start window expires without a successful Start |
| Effect | Terminates the engagement |
| Refund — single-payment | **100%** of **locked** compensation to the creator |
| Refund — milestones | **100%** of **locked** compensation to the creator (no milestone releases before Start under normal flow) |
| Refund fee | **No 10%** service fee on this refund |
| Ledger | Atomic, idempotent; existing wallet ledger patterns |

### 3.12 Missed delivery deadline — creator dismissal (**PLANNED**)

Distinct from failure to start (§3.11). Applies only after the Worker has **successfully Start**ed.

If the Worker has **not** submitted a **qualifying deliverable** (§3.14) by the **adjusted delivery deadline**, the creator may dismiss the Worker under missed-deadline protection.

| Rule | Detail |
|------|--------|
| Availability | Dismissal **not** available **before** the adjusted deadline passes |
| Effect | Terminates the engagement |
| Worker pay | No **further** compensation for the dismissed engagement |
| Single-payment refund | **100%** of **remaining locked** compensation to the creator |
| Refund fee | **No 10%** service fee on refunded amounts |
| Ledger | Atomic, idempotent |

#### Milestone engagements — Option B (approved)

- **Previously approved and released** milestone payments **remain** with the Worker.
- Creator receives refund of **all remaining locked** compensation (unreleased / unapproved portions).
- Worker does **not** receive payment for incomplete or unapproved milestones.
- **Do not** reverse already-released, approved milestone payouts.

Existing milestone approval, revision, and dispute rules are **unchanged** unless explicitly stated here.

### 3.13 Mutually agreed delivery extensions (**PLANNED**)

- **Neither** party may unilaterally extend the delivery deadline.
- Extension requires **explicit agreement** by **both** creator and Worker **before** the current adjusted deadline expires.
- Record in engagement history: original deadline, proposed new deadline, both parties’ consent, **consent timestamps**, final deadline.
- Any extension must remain consistent with the **30-day maximum measured from Start** (server-enforced).
- If either party declines, the **current** adjusted deadline remains in force.

### 3.14 Submission, review, and creator inactivity (**PLANNED**)

- Worker who submits the **required qualifying deliverable** **before** the adjusted delivery deadline has **met** the deadline (review may continue afterward).
- Creator review and revisions follow the **normal** approval process (**IMPLEMENTED** milestone and completion rules unchanged).
- Creator inactivity after a **timely** deliverable submission does **not** trigger missed-deadline dismissal.
- Ordinary chat messages and progress updates are **not** qualifying deliverables unless covered by an approved submission rule (**UNRESOLVED** mechanism — UD-21).

**Repository today:** completion flows use `mark_service_complete` / milestone submit paths; dismissal paths and deliverable-vs-chat distinction are **not implemented**.

### 3.15 Final delivery deadline vs per-milestone rules (**PLANNED**)

- The **final adjusted delivery deadline** applies to the **entire Request engagement**.
- **Per-milestone** deadlines and approval rules remain **separate** (**IMPLEMENTED** where shipped).
- Missing the **final** deadline triggers §3.12, including **Option B** for milestone payment structure.
- Do **not** silently change existing milestone payment, approval, revision, dispute, or **72h single-payment auto-complete** rules (§3.8).

---

## 4. Profiles, usernames, discovery

### 4.1 Current state (**IMPLEMENTED**)

- `profiles`: `display_name`, `bio`, `avatar_path`, `phone`, rating aggregates, completion counts, `discovery_location` — **no username** (`20260930000300_tables_indexes_views.sql`).
- RLS: users read/update **own** profile only (`20260930000500_rls_and_realtime.sql`).
- Limited public fields exposed via browse/search RPCs (e.g. `requester_display_name`, `bio`, ratings in `search_requests`, `20261104120000_browse_requester_profile_on_feed.sql`).
- Self profile: `apps/mobile/app/profile/index.tsx`; entry from home header (`HomeFeedHeader.tsx`), **not** a bottom tab.
- `PersonProfileBottomSheet` — contextual preview, not a full public profile route.

### 4.2 Usernames (**PLANNED**)

- Unique handles; discovery by username, display name, and bio.
- Implementation: extend `profiles` or companion table; **SECURITY DEFINER** public profile RPCs; never widen unrestricted `profiles` SELECT.

### 4.3 Public profile allowlist (**PLANNED**)

May include: photo, display name, username, bio, verification badge, Crown/points (per privacy), completed-work stats, star rating summary, relevant public activity.

Must **not** expose: phone (except post-accept engagement rules), `discovery_location`, wallet data, private settings.

### 4.4 Profile activity hub (**PLANNED**)

- Sections: Requests created, Responses submitted, Projects created/participated.
- Pagination / infinite scroll; collapsing header with sticky activity tabs.
- Settings in **profile header**, not bottom nav.

### 4.5 Crown visibility preference (**PLANNED**)

- Default **show** Crown on public profile.
- When hidden: others do not see Crown; owner sees full progression.

---

## 5. Search and navigation

### 5.1 Current navigation (**IMPLEMENTED**)

**Mobile** (`apps/mobile/app/(tabs)/_layout.tsx`): Home, **Activity**, Create, **Notifications**.

**PWA** (`apps/pwa/src/components/navigation/HomeTabBar.tsx`): same four destinations.

Wallet: stack route from home header balance and profile row. Profile: stack from home avatar. Search: **modal** `app/search.tsx` → sets home tab param `q` (`app/(tabs)/index.tsx`) — **filters Home feed**, not independent results.

### 5.2 Target navigation (**PLANNED**)

Bottom tabs: **Home · Search · Create · Wallet · Profile**

- **Search** replaces **Activity** tab.
- **Notifications** move to icon/header (or profile) — exact placement **UNRESOLVED** UI detail.
- Activity lists (**IMPLEMENTED** `activity/_layout.tsx`: My Requests / My Responses) migrate to **profile activity** tabs.

### 5.3 Search experience (**PLANNED** + partial **IMPLEMENTED**)

| Tab      | Content                                                |
| -------- | ------------------------------------------------------ |
| Top      | Blended discovery                                      |
| Requests | Text + predefined tags (**extends** `search_requests`) |
| People   | Username, display name, bio (**PLANNED**)              |
| Projects | Text + tags (**PLANNED**)                              |

Search must **not** silently filter Home. Home may deep-link from Search but should not be the sole results surface.

**IMPLEMENTED:** `search_request_queries`, debounced suggestions (`home-search.ts`), location required for `search_requests`.

---

## 6. Projects (**PLANNED**)

### 6.0 Domain (settled)

Projects are a **separate product domain** from individual **Requests**. Do **not** implement Projects as Requests with multiple Workers.

A Project is a collaborative structure consisting of:

- A parent **Project**.
- A shared **funding pool** (§7).
- Multiple **Worker assignments**, each with independent terms.
- Deliverables and milestone structures per assignment.
- Funding **reservations** and payment history.

The **Project creator** controls how the shared pool is **allocated** to assignments (subject to funding and reservation rules). Contributors do **not** earmark pool funds to specific Workers or assignments.

**Social scope (settled):** No **following** system in v1.0. Do **not** silently add anonymous contributions or other unapproved social features (see UD-03).

### 6.1 Creation (Premium-gated)

Fields (settled unless marked **UNRESOLVED**):

- Title, description; predefined tags (**no 3-tag limit**).
- Optional media.
- **Project visibility** — **creator-controlled** at creation (**settled**); who can see the Project under each supported mode (**UNRESOLVED** — UD-01). Distinct from **funding visibility** (§7.8).
- **Funding visibility** — who may contribute (see §7.8; separate from Project visibility).
- **Total Project budget** — maximum contributions accepted (no overfunding).
- **Minimum funding target** — minimum **total** pool balance before assignments can be created or accepted (≤ total budget; separate setting).
- **Minimum contribution** — smallest amount an individual funder may contribute.
- **Funding deadline** — distinct from Project completion deadline (see §7.3).
- Multiple Workers via assignments; collaborative contributions (**PLANNED** — assignments gated on minimum funding target, §7.2).

### 6.2 Assignments

Each Worker: independent assignment with title, description, deliverables, compensation, due date, payment type (single or milestones), status, submission/revision history, approval/payment history.

- Creator may accept **multiple** Workers.
- Dispute on one assignment does not automatically void others (**PLANNED** isolation).

### 6.3 Assignment agreements

- Agreed terms recorded in-app.
- Changes to deliverables/compensation require affected Worker’s agreement; history preserved.
- Official records live in Active; external chat does not replace them.

---

## 7. Project funding (**PLANNED**)

### 7.1 Funding configuration (settled)

Every Project has **three separate monetary settings** (do not conflate):

| Setting                    | Meaning                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Total Project budget**   | Full amount required for the Project; stop accepting contributions when fully funded (**no overfunding**).       |
| **Minimum funding target** | Minimum **total** contributions required before **assignments may be created or accepted** (creator-configured). |
| **Minimum contribution**   | Smallest amount an individual funder may contribute (creator-configured; separate from target and budget).       |

Additional rules:

- Shared **funding pool**; contributors do not earmark funds to specific Workers — creator allocates to assignments.
- Reaching the minimum target **unlocks** assignment creation and acceptance; it does **not** require the full budget to be funded.
- Contributions may continue after the minimum target until the total budget is full.
- Creator may **increase** total budget subject to existing commitments; **cannot reduce** budget below **committed** compensation (reservations + accepted terms).
- Only the **Project creator** may **invite** contributors (in either funding visibility mode).

### 7.2 Assignment gate and commencement (settled)

Preserve three separate concepts:

| Concept | Meaning |
|---------|---------|
| **Minimum funding target** | Unlocks **creating** and **accepting** assignments |
| **Secured assignment compensation** | Full agreed compensation **reserved** for that assignment |
| **Assignment start** | Worker **commences** work only after their compensation is secured and Project commencement rules are met |

Rules:

- **Assignments cannot be created or accepted** until the **minimum funding target** is reached.
- **Early commencement cannot bypass** the minimum funding target.
- After the minimum target is met, assignments may be created and accepted.
- **Workers may commence independently** per assignment once **that assignment’s** compensation is fully secured and applicable commencement conditions are met (multiple Workers need not start together).
- **Early commencement** (creator setting, if offered): after the minimum target is met, a Worker may **start** before the **entire** Project budget is funded if **that Worker’s** full agreed compensation is **secured** (reserved). Early commencement **never** bypasses the minimum funding target.
- When early commencement is **disabled**, additional rules are **UNRESOLVED** (UD-20).
- Full agreed compensation for an assignment must be **reserved** before that Worker **starts** that assignment.
- **Never** reserve more than available unreserved pool funds; **never** double-reserve the same funds.
- Use **separate** pool and `project_assignment_reservations` tables — **do not** use `payment_locks.request_id` UNIQUE.

### 7.3 Funding deadline (settled)

This is the **funding** deadline, **not** the Project completion deadline.

| Rule          | Detail                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Period limits | Minimum **1 day**, maximum **30 days**, default **7 days** from open                                                        |
| Date choice   | Creator chooses **Today** or a **Future date** (same pattern as Request expiry)                                             |
| Default time  | **11:59 PM** on the selected date in creator timezone                                                                       |
| Time override | Creator may set a different time if the resulting instant is **in the future**                                              |
| While open    | Creator may **shorten** the deadline; **cannot extend** after funding opens                                                 |
| Persistence   | Store absolute `timestamptz`; use **`Africa/Lagos`** for Nigerian market where appropriate; **no** “add 24 hours” shortcuts |
| Enforcement   | Backend validates date, time, and period limits — not client-only                                                           |

Evaluate **Funding Unsuccessful** lazily on access/interaction after the deadline — **no** scheduled job required at the exact deadline instant.

### 7.4 Funding unsuccessful (settled)

If the funding deadline passes **before** the minimum funding target is reached:

- Project status becomes **Funding Unsuccessful**.
- **New contributions** and **new assignments** are blocked.
- **Existing accepted assignments** and **secured Worker compensation** (reservations) must **not** be invalidated.
- **No automatic refunds**; each contributor may **independently claim** eligible refunds to their Active wallet.
- Refunds: **full** eligible amount, **no platform fee**, **atomic**, **idempotent**, once per contribution, no creator approval.
- Contributors **cannot** withdraw amounts already **reserved** for Worker compensation.

### 7.5 Shared-pool accounting (settled requirement)

The system must track, per contributor and per contribution:

- Gross contribution amount.
- Amount **attributed to reservations** (committed to Worker compensation from that contributor’s share of the pool — allocation method **UNRESOLVED**, see register).
- **Previous refunds** and **remaining eligible refundable balance**.

Contributors are **not** automatically entitled to refund **100%** of gross contribution if part of that contribution has already been **committed** to reservations. Refund RPCs must refuse amounts above eligible balance.

**UNRESOLVED:** exact proportional allocation of pool reservations to contributors and kobo rounding rules.

### 7.6 Contributor refunds (settled process)

- Self-service claim; wallet credit via ledger pattern (`wallet_apply_entry` idempotency).
- Record in wallet ledger and Project activity history.

### 7.7 Project cancellation (**UNRESOLVED** cases)

Separate cases: before assignments accepted; after accept before work; after work starts; mixed completion. Creator must not cancel to escape accepted Worker commitments. **UNRESOLVED:** fund disposition when some assignments completed.

### 7.8 Funding visibility (settled)

Distinct from **Project visibility** (creator-controlled viewing rules — UD-01).

| Mode            | Who may contribute                                         |
| --------------- | ---------------------------------------------------------- |
| **Invite-only** | Only users **invited** by the creator (eligible invitees). |
| **Public**      | Eligible users may contribute **without** an invitation.   |

The creator may send invitations in **either** mode; **only the creator** issues invitations.

### 7.9 Unused funds (**UNRESOLVED**)

Direction: return eligible **uncommitted** funds to contributors proportionally. Final calculation and partial-completion policy **not approved**.

---

## 8. Assignment payments and disputes (**PLANNED**)

Adapt Request principles per assignment:

- 10% fee on Worker payout (not added to reservation).
- Milestones: 2–5, sum to agreed compensation, sequential explicit approval, upfront reservation.

Reuse `service_problems` patterns where appropriate with `assignment_id` scope (**PLANNED** schema).

**No** 72h auto-complete for Project milestone approvals unless explicitly decided later (**settled: do not auto-extend**).

---

## 9. Standard and Premium experiences (**PLANNED**)

### 9.1 Standard experience (**IMPLEMENTED** Requests + **PLANNED** parity)

- **Requests** — individual marketplace postings; **no** Premium required to create or respond (subject to existing wallet and verification rules).
- Core Request rules remain: expiry independent of delivery deadlines, lock on accept, 10% fee on payout, milestone rules, 72h single-payment auto-complete, no milestone auto-complete, disputes as today.

### 9.2 Premium Collaborative experience (**PLANNED**)

- **Premium** is associated with **collaborative Project creation** and the **Premium entitlement** model (server-side gate).
- **One 30-day trial per account**, **no** payment card required; show expiry and reminders.
- Only the **Project creator** needs Premium; Workers, contributors, and Request participants do not.
- On Premium expiry: **Requests** unchanged; **existing** Projects remain **fully operable**; **new** Project creation is blocked until entitlement is restored.
- **Premium ≠ Crown**; **Gold** reputation tier does **not** grant Premium.
- Paid pricing and payment provider **UNRESOLVED** (UD-13).

---

## 10. Unified reputation and Crown (**PLANNED**)

- **One** reputation per user across Request creator, Worker, Project creator, Contributor roles.
- **Star ratings remain separate** from points.

### Crown thresholds (configurable, pending final approval)

| Crown   | Points |
| ------- | -----: |
| Bronze  |      3 |
| Silver  |     10 |
| Diamond |     25 |
| Gold    |     50 |

### Gold Shield (settled proposal)

- Main points capped at 50; no growth beyond Gold.
- Shield capacity 10; deductions consume Shield first, then Main.
- Main &lt; 50 → lose Gold (Diamond); regaining Gold restores Main 50 and full Shield.
- Serious misconduct → account restrictions independent of Shield.

Lower crowns: no Shield.

### Presentation (**PLANNED**)

Crown artwork, points, next level, progress bar, Gold Shield meter; use Bronze/Silver/Diamond assets; **preserve official Gold logo** (`apps/website/public/assets/active-crown.png`, mobile logo assets).

### Ledger (**PLANNED**)

Append-only `reputation_ledger`; server-calculated; admin adjustments audited via `admin_audit_events` pattern.

Point values, evidence standards, appeals **UNRESOLVED**.

---

## 11. Admin and operations

### 11.1 **IMPLEMENTED**

- Roles: `super_admin`, `support_admin`, `finance_admin` (`20261017120000_admin_members.sql`).
- Users, Requests, reports, wallets, withdrawals, audit logs, operational issues.
- `admin_record_audit_event` for sensitive actions.

### 11.2 **PLANNED** additions

Project moderation, assignment disputes, funding/refund visibility, reputation/Crown adjustments, Premium entitlement overrides — via new RPCs and dashboard routes under `apps/admin`.

### 11.3 Auto-complete scheduling

**Verification required:** Confirm production invokes `auto_complete_due_requests` (Supabase scheduled Edge Function, external cron, or manual ops). Migrations alone do not schedule it.

---

## 12. Technical architecture principles (documentation only)

- Preserve Request RPCs and lifecycle.
- Projects: new tables, pool, reservations, assignments.
- Reuse `wallet_apply_entry` idempotency (`20261005130000_wallet_ledger_service.sql`).
- Authoritative money in SQL **bigint kobo**; client `Number` only for whole-naira **display/input** with server re-validation.
- Transactional SECURITY DEFINER RPCs; restrictive RLS; public data via explicit RPCs.
- Avoid unnecessary shared-package refactor; PWA parity after mobile/backend stable.

---

## 13. PWA vs mobile (verified)

PWA mirrors many flows; gaps documented in `apps/pwa/docs/marketplace-implementation.md` (wallet UI, NIN, profile interests, etc.). v1.0 navigation and Search parity are **PLANNED** after mobile foundation.

---

## 14. References

| Topic                 | Location                                         |
| --------------------- | ------------------------------------------------ |
| Milestone payments    | `supabase/docs/request-milestone-payments.md`    |
| Paystack env          | `docs/paystack-environment.md`                   |
| Admin                 | `docs/admin-dashboard.md`                        |
| DB types              | `apps/mobile/src/lib/supabase/database.types.ts` |
| Implementation phases | `ACTIVE_IMPLEMENTATION_ROADMAP.md`               |
| Gaps                  | `ACTIVE_EXISTING_VS_PLANNED.md`                  |
| Open questions        | `ACTIVE_UNRESOLVED_DECISIONS.md`                 |

---

## 15. Version history

| Version | Date       | Notes                                                                                                          |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-11-19 | Initial consolidation from repository inspection + product decisions in consolidation prompt                   |
| 1.0.1   | 2026-11-19 | Project funding config, assignment gate, deadlines/timezones, pool accounting; Request expiry corrections      |
| 1.0.2   | 2026-11-19 | Worker delivery deadline, missed-deadline dismissal (Option B milestones), mutual extensions, submission rules |
| 1.0.3   | 2026-11-19 | Universal 24h Start workflow; calendar deadline shift on Start; failure-to-start vs missed-delivery dismissal; Project domain and Premium/Standard framing |
