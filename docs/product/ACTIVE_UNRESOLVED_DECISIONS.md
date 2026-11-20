# Active — Unresolved Decisions Register (v1.0.3)

Only **genuine** open product choices or **verification** tasks. **Settled** decisions (including Project funding configuration, assignment gate, funding visibility modes, refund process constraints) are documented in `ACTIVE_PRODUCT_SPEC_V1.md` and are **not** listed here.

## How to read this register

| Category | Meaning |
|----------|---------|
| **Blocks phase** | Implementation of that phase should not ship production behavior until resolved (or until an explicit interim scope is approved). |
| **Resolve later** | Can ship earlier phases with stubs, admin-only paths, or reduced automation. |
| **Operational verification** | Not a product decision; engineering/ops must confirm in production. |

**Recommendations** in the “Notes” column are **not** approvals.

---

## Discovery and Project access

### UD-01 — Project visibility modes (creator-controlled)

| | |
|--|--|
| **Settled** | **Project visibility is creator-controlled** at creation; **distinct** from **funding visibility** (invite-only vs public contribution). **No following system** in v1.0. |
| **Question** | What **visibility modes** exist and who can **view** a Project under each (public, restricted, invite-only viewing, assignment participants only, etc.)? |
| **Why** | Drives RLS, `search_projects`, and share URLs — funding-public does **not** imply Project-public. |
| **Blocks** | **Phase 5** (indexing), **Phase 9** (discovery) |
| **Resolve** | Before Project discovery launch |

### UD-03 — Anonymous contributions

| | |
|--|--|
| **Question** | Can contributors appear as anonymous on public Project activity? |
| **Why** | Ledger metadata and activity feeds. |
| **Blocks** | **Resolve later** — Phase 6 can default to display name + username |
| **Resolve** | Before public Project launch polish |

---

## Funding, refunds, cancellation

### UD-19 — Contribution reservation allocation and refund rounding

| | |
|--|--|
| **Question** | How is each contributor’s **refundable balance** computed after **partial** reservation from the shared pool (proportional method, order, kobo remainder)? |
| **Why** | Spec requires per-contribution eligible balance; prohibits full refund when funds are reserved — implementation needs a defined algorithm. |
| **Blocks** | **Phase 6** (refund RPC correctness), **Phase 6 gate** in roadmap |
| **Resolve** | Before Phase 6 coding starts |
| **Notes** | Technical options exist; product must approve formula/rounding. |

### UD-04 — Unused funds after partial Project completion

| | |
|--|--|
| **Question** | Exact proportional return of **uncommitted** pool funds after completion/cancellation paths. |
| **Why** | Financial integrity. |
| **Blocks** | **Phase 8** closure / GA |
| **Resolve later** | Phase 7 can proceed without final closure math |

### UD-05 — Project cancellation after accepted assignments

| | |
|--|--|
| **Question** | How are pool funds split when creator cancels with mixed completed/ongoing assignments? |
| **Why** | Spec forbids inventing policy. |
| **Blocks** | **Phase 8** legal/product sign-off |
| **Resolve later** | |

### UD-06 — Reopen funding after Funding Unsuccessful

| | |
|--|--|
| **Question** | Can creator reopen funding on the same Project after Funding Unsuccessful? |
| **Why** | Lazy status transition — terminal vs clone. |
| **Blocks** | **Resolve later** — Phase 6 can treat as terminal unless decided |
| **Notes** | Recommendation was “clone new Project”; **not approved**. |

### UD-20 — Early commencement disabled — start rules

| | |
|--|--|
| **Question** | When early commencement is **off**, must the **full Project budget** be funded before any Worker **starts**, or only reservations + minimum target rules? |
| **Why** | Spec defines early commencement when **on**; off-path not fully specified. |
| **Blocks** | **Resolve later** — Phase 7 `start_assignment` guards |
| **Resolve** | Before Phase 7 GA |

---

## Reputation

### UD-08 — Exact point values per event

| | |
|--|--|
| **Question** | Points for complete Request, positive/negative conduct events, etc. |
| **Blocks** | **Resolve later** for ledger schema; **blocks** automated Crown hooks until set |
| **Phase** | 3 automation |

### UD-09 — Evidence standards and appeals

| | |
|--|--|
| **Question** | Evidence required before deduction; appeal workflow. |
| **Blocks** | **Resolve later** — positive-only automation can ship first |
| **Phase** | 3 / 10 |

### UD-10 — Star ratings → Crown points

| | |
|--|--|
| **Question** | Automatic link from star ratings to points? |
| **Blocks** | **Resolve later** |
| **Phase** | 3 |

---

## Search and UX

### UD-11 — Top tab ranking

| | |
|--|--|
| **Question** | How to blend Requests, People, Projects on Search **Top**. |
| **Blocks** | **Resolve later** — Phase 9 polish |
| **Phase** | 9 |

### UD-12 — Notifications placement after nav change

| | |
|--|--|
| **Question** | Where inbox and badges live when Activity tab removed. |
| **Blocks** | **Phase 2** UX (can ship with interim header bell) |
| **Phase** | 2 |

---

## Premium

### UD-13 — Pricing and payment provider

| | |
|--|--|
| **Question** | Paystack subscription vs stores vs manual grant for paid Premium. |
| **Blocks** | **Paid** Premium launch only; trial does not require |
| **Phase** | Pre-GA paid conversion |

### UD-14 — Trial abuse prevention

| | |
|--|--|
| **Question** | Trial once per `user_id` only vs phone/NIN fingerprint. |
| **Blocks** | **Resolve later** — Phase 4 can ship user_id |
| **Phase** | 4 hardening |

---

## Communication

### UD-15 — Project / assignment chat architecture

| | |
|--|--|
| **Question** | New tables vs reuse Request conversation model. |
| **Blocks** | **Phase 7** only if chat required in assignment MVP |
| **Notes** | Technical recommendation: separate tables; **not** a product decision. |

---

## Requests (existing product)

### UD-16 — Optional work scheduling in create UI

| | |
|--|--|
| **Question** | Keep optional `scheduled_for` (“when work is expected”) in create flow after expiry redesign? |
| **Why** | Expiry must not reuse `scheduled_for`. |
| **Blocks** | **Resolve later** — Phase 0/2 expiry can ship without scheduling field |
| **Phase** | 0 / 2 |

### UD-17 — Request expiry extension policy

| | |
|--|--|
| **Question** | Can creator extend `expires_at` on **posted** Requests (beyond current awaiting-review `extend_request`)? |
| **Why** | Repository: `extend_request` limited (`20261010130100_manual_request_awaiting_review.sql`). |
| **Blocks** | **Resolve later** — not required for Phase 0 expiry MVP |
| **Phase** | 0+ |
| **Notes** | No maximum horizon invented in v1.0. |

### UD-21 — Qualifying deliverable submission (Request)

| | |
|--|--|
| **Question** | Which server-side actions count as the **required deliverable submission** for delivery-deadline compliance (vs chat or progress updates)? |
| **Why** | Spec §3.14 requires distinction; repository uses completion-proof / milestone submit paths — alignment not verified for all payment structures. |
| **Blocks** | **Phase 0b** missed-delivery dismissal (can ship respond/accept/Start + deadline first) |
| **Resolve** | Before missed-deadline dismissal goes live |
| **Notes** | Product rule is set; **mechanism** not yet verified in codebase. |

---

## Operational verification (not product decisions)

### OV-01 — Production auto-complete scheduler

| | |
|--|--|
| **Question** | What invokes `auto_complete_due_requests` in production? |
| **Why** | No `cron.schedule` in migrations for this function. |
| **Blocks** | **Ops confidence** for Request 72h rule — not a feature phase |
| **Action** | Verify scheduler or runbook before marketplace GA |

### OV-02 — CI pipeline location

| | |
|--|--|
| **Question** | Where automated `pnpm validate` / `db:test` run? |
| **Why** | No `.github/workflows` in repo. |
| **Blocks** | Engineering process only |

---

## Removed / merged items

- **UD-02 (funding visibility matrix)** — **Settled:** funding modes are **invite-only** vs **public contribution**; creator invites in both. Remaining gap is **Project visibility** (UD-01), not funding visibility.
- **UD-07 (budget increase notifications)** — **Resolve later**; does not block Phase 6.

---

## Blocking implementation summary

| Must resolve before… | IDs |
|----------------------|-----|
| Project create / discovery indexing | **UD-01** |
| Phase 6 refund implementation | **UD-19** (allocation + rounding) |
| Project financial closure / GA | **UD-04**, **UD-05** |
| Automated reputation deltas | **UD-08**, **UD-09**, **UD-10** |
| Paid Premium (not trial) | **UD-13** |
| Request expiry extension feature | **UD-17** |
| Missed-deadline dismissal (deliverable detection) | **UD-21** |
| Production Request auto-complete reliability | **OV-01** (verification) |

| Can proceed with interim scope | IDs |
|-------------------------------|-----|
| Phase 0 Request expiry | UD-16, UD-17 |
| Phase 0a (Worker Start + failure-to-start) | — |
| Phase 0b (deadline shift on Start) | UD-21 for missed-delivery dismiss only |
| Phase 2 nav | UD-12 (interim header) |
| Phase 4 trial | UD-14 |
| Phase 6 pool (before refunds) | UD-06, UD-03 |
| Phase 7 start rules | UD-20 |