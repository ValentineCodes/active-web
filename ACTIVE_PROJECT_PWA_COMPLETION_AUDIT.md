# ACTIVE — Project collaboration PWA completion audit

**Audit date:** 2026-11-21  
**Scope:** PWA project response review, group chat, budget breakdown, assignment detail, worker work experience, formal submissions in group chat. Mobile out of scope.

**Method:** Static route/RPC/UI trace through implemented code, plus automated checks. No full manual browser QA. Supabase pgTAP not executed locally (Docker / Supabase not running).

---

## 1. Creator journey (code verification)

| Step | Status | Evidence / notes |
|------|--------|------------------|
| Open project | **Verified (code)** | Route `/project/:id` → `ProjectDetailPage`. |
| Review worker responses | **Verified (code)** | Assignments tab → `ProjectResponsesPanel` + `list_project_responses`. |
| Response bottom sheet | **Verified (code)** | `ProjectWorkerResponseSheet` from `ProjectResponsesPanel`. |
| Accept/reject in sheet | **Verified (code)** | `useAcceptProjectWorkerResponse` / `useRejectProjectWorkerResponse`; `allowReview` creator-only. |
| Accepted worker on assigned list | **Verified (code)** | Assigned filter → `projectResponsesForFilter`; **View assignment** on cards. |
| Open assignment screen | **Verified (code)** | `/project/:id/assignment/:assignmentId` → `ProjectAssignmentDetailPage`. |
| Group chat from header | **Verified (code)** | `RequestFlowHeader` + `group_chat_conversation_id` when creator or active worker. |
| Budget breakdown | **Verified (code)** | `ProjectFundingCard` + `ProjectBudgetBreakdown` when `viewer_may_view_budget_breakdown`. |
| Formal submissions in chat | **Verified (code)** | `ProjectAssignmentSubmissionMessageBubble`; metadata `kind: project_assignment_submission`. |
| Navigate to assignment from submission | **Verified (code)** | **Review assignment** → assignment route (creator/non-outgoing). |
| Release payment when eligible | **Verified (code)** | `creator_may_release_payment` from RPC; `useApproveProjectAssignmentPayout`. |
| Budget refresh after payout | **Verified (code)** | Mutation invalidates `queryKeys.project(projectId)`. |
| Report | **Verified (code)** | `useReportProjectAssignmentProblem` + `ReportIssueModal` (creator/worker per RPC). |
| Rate worker | **Incomplete** | No `rate_project_assignment` (or equivalent); `RatePage` is request-scoped only. |

**Gaps**

- **Reserve compensation from pool** after accept: RPC exists (`reserve_project_assignment_compensation`) but **no PWA control** (mobile assignment screen has it). Creators cannot secure pay from PWA alone today.
- **Milestone payout UX**: Release uses server milestone ordering; no inline milestone approve UI beyond assignment detail + RPC flags.

---

## 2. Contributor journey

| Capability | Status | Notes |
|------------|--------|--------|
| Open project | **Verified (code)** | `assert_may_view_project` via `get_project`. |
| Budget breakdown | **Verified (code)** | Same as creator when `viewer_may_view_budget_breakdown`. |
| See assigned workers / open assignment | **Verified (code)** | Assignments tab via `projectViewerMayViewAssignments`; `get_project_assignment` allows contributors (read-only). |
| Group chat | **Verified (code)** | Member trigger on contribution; header chat when `group_chat_conversation_id` returned. |
| View submission messages | **Verified (code)** | Same conversation UI as creator. |
| Follow activity | **Verified (code)** | Activity tab → `ProjectActivityPanel`. |
| Accept/reject responses | **Blocked** | `allowReview` only when `viewer_is_creator`. |
| Reserve / release payment | **Blocked** | RPCs require creator; UI hides release for non-creators. |
| Creator-only management | **Blocked** | No reserve UI for contributors. |

---

## 3. Accepted worker journey

| Capability | Status | Notes |
|------------|--------|--------|
| Submit project response | **Verified (code)** | Response tab when no active assignment; `useRespondToProject`. |
| Pre-acceptance private chat | **Verified (code)** | `useWorkerProjectPreHandshakeConversation` + 1:1 project conversation (not group). |
| Acceptance / rejection notifications | **Partial** | Server notifications from response review migration; not re-tested without DB. |
| Group chat after acceptance | **Verified (code)** | Trigger `trg_project_assignment_accepted_group_member` on `accepted`. |
| Active-work experience | **Verified (code)** | **Your work** tab → `ProjectWorkerWorkPanel`. |
| Assignment details | **Verified (code)** | Assignment route + cards. |
| Formal submit to group chat | **Verified (code)** | `ProjectAssignmentSubmitSheet` + `begin/complete_project_assignment_submission`. |
| Submission ↔ assignment link | **Verified (code)** | Message metadata + `group_message_id` on submission row. |
| Payment / completion updates | **Partial** | Chat metadata `review_state` synced on payout; wallet notifications depend on existing wallet pipeline. |
| Other workers’ controls | **Blocked** | `get_project_assignment` + worker-only mutations. |

**Gaps**

- Profile **Responses** tab lists project work cards; no dedicated “My project assignments” inbox section beyond that list.
- Workers without active assignment still see browse/response UX (intended).

---

## 4. Group chat membership

| Rule | Status | Notes |
|------|--------|--------|
| Creator in group | **Verified (code)** | `trg_project_created_group_chat`. |
| Contributors in group | **Verified (code)** | `trg_project_contribution_group_member`. |
| Accepted workers in group | **Verified (code)** | Status transition to `accepted`. |
| Pending/rejected workers excluded | **Verified (code)** | No member insert until `accepted`. |
| Unauthorized access blocked | **Verified (code)** | `project_group_conversation_is_accessible`; storage paths tied to membership. |
| Pre-acceptance 1:1 private | **Verified (code)** | Separate `project_conversations` / pre-handshake RPCs preserved. |

**Gap:** `list_my_request_conversations` was **not** extended in `20261221130000_project_group_chat.sql` — project group threads may **not appear in Messages inbox** unless opened via project header/deep link. Realtime on `project_group_messages` is wired in `conversation-api.ts`.

---

## 5. Financial consistency

| Check | Status | Notes |
|-------|--------|--------|
| Budget fields on `get_project` | **Verified (code)** | `paid_out_total_kobo`, `reserved_total_kobo` (secured unpaid), `available_total_kobo`, `contributed_total_kobo`, `budget_total_kobo`. |
| UI does not double-subtract paid out | **Verified (code)** | `ProjectBudgetBreakdown` copy; available uses pool unreserved. |
| Contribution / reserve / payout RPCs unchanged | **Verified (code)** | No client-side duplicate ledger. |
| Payout idempotency | **Verified (code)** | `wallet_reference` + `approve_and_payout_*`; duplicate idempotent return in tests (not run). |
| Submission without failed-upload record | **Verified (code)** | Two-phase begin/complete; abort removes draft message. |

**Not executed:** pgTAP `project_budget_breakdown.test.sql`, `project_pool_reservations.test.sql`, `project_assignment_delivery.test.sql` (DB down).

---

## 6. PWA completeness (static)

| Area | Status |
|------|--------|
| Routes `/project/:id`, `/project/:id/assignment/:assignmentId` | OK |
| Deep links / refresh | OK (data from RPCs, not navigation state) |
| Header chat + unread | OK (`group_chat_unread_count`) |
| Response bottom sheet | OK |
| Assignment navigation | OK |
| Loading / empty / error | OK (skeletons, `EmptyState`, `InlineError` on key pages) |
| Realtime (group messages) | OK (subscription in `conversation-api.ts`) |
| Notifications | Partial (group notify + submission update trigger; inbox gap above) |
| Responsive layout | OK (existing Tailwind patterns; no dedicated audit pass) |

No PWA E2E test suite in repo.

---

## 7. Security & regression (automated)

### Bugs found and fixed in this audit

1. **`ProjectWorkerAssignmentActions`** — `conversationHref` required `returnTo: string`; passed `undefined` when `projectId` optional → **fixed** (always use `row.project_id` fallback).
2. **`RequestFlowHeader`** — invalid Ionicon `chatbubble-ellipses-outline` broke `tsc` → **fixed** to `chatbubble-outline`.
3. **`milestone-negotiation.test.ts`** — missing `description` on fixtures broke build → **fixed** (unrelated to projects but blocked CI).

### Security (code review, not penetration tested)

- Assignment access: `assert_may_view_project_assignment` (creator, worker, contributor).
- URL mismatch: assignment page rejects wrong `project_id` in URL.
- Formal submit: worker-only, commenced, attachments required, draft hidden from other members.
- Payout: creator-only RPCs; `creator_may_release_payment` computed server-side.
- Attachments: existing `can_read/write_conversation_media` paths include `project_group_message_attachments`.

### Test results (actual)

| Command | Result |
|---------|--------|
| `pnpm pwa:test` | **PASS** — 9 files, 21 tests |
| `pnpm pwa:typecheck` | **PASS** (after fixes above) |
| `pnpm pwa:lint` | **PASS** (runs `tsc --noEmit`) |
| `pnpm pwa:build` | **PASS** — Vite production build completed |
| `pnpm db:test supabase/tests/project_*.test.sql` | **FAIL** — `ECONNREFUSED 127.0.0.1:54322` (Supabase/Docker not running) |

Project-related pgTAP files present: `project_response_review`, `project_group_chat`, `project_budget_breakdown`, `project_assignment_detail`, `project_assignment_group_submission`, plus existing assignment/delivery/pool tests.

---

## 8. Known limitations

1. **No project worker rating** in PWA (request-only `rate_request`).
2. **No PWA “reserve compensation”** action for creators after accepting a worker.
3. **Messages inbox** may not list project group threads (navigation via project header/link still works).
4. **`submit_project_assignment_work`** (note-only, no files) remains for legacy/tests; PWA uses group-chat formal submit only.
5. **pgTAP / local DB** not run in this environment — financial and RLS assertions unverified here.
6. **Types:** `database.types.ts` partially hand-patched; run `pnpm db:types` after migrations when Docker is up.

---

## 9. Remaining mobile migration work

- Assignment screen still has **submission history** section (explicitly not ported to PWA).
- Mobile already has reserve/accept/start/submit patterns; align with `begin/complete_project_assignment_submission` when mobile is picked up.
- Parity for **Messages inbox** union with project group conversations.
- Project **rating** flow when product defines RPC.
- Creator **reserve compensation** on mobile should be mirrored on PWA when prioritised.

---

## 10. Verdict

The PWA implements the intended **project collaboration spine** (responses → assignment detail → group chat → formal submissions → creator payout) with contributor read access and worker active-work mode. It is **not** fully production-signed-off without:

- Local pgTAP runs,
- Manual cross-role QA,
- Closing gaps: **creator reserve on PWA**, **project rating**, **inbox listing for group chat**.

Build and unit tests **pass** after the small fixes listed above; completion is **not** claimed on build alone.