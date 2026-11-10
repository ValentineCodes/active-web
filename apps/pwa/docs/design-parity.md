# PWA ↔ native visual parity checklist

**Reference:** `apps/mobile` (light/dark via `ThemeProvider`). **Scope:** `apps/pwa` only — behavior and APIs unchanged.

**Foundation:** `src/design-system/` (`palette.ts`, `tokens.css`, `layout.ts`), Tailwind 4 `@theme`, primitives (`Button`, `TextField`, `Card`, `Badge`, `Header`, `Screen`, `FlowScreen`, `BottomSheet`, `ToastProvider`), `HomeTabBar` (web tab bar, not liquid glass).

**Validation:**

```bash
pnpm pwa:typecheck && pnpm pwa:lint && pnpm pwa:test && pnpm pwa:build
```

**Responsive QA:** Manual only — portrait/landscape at ~320px, 390px, 430px widths; confirm no horizontal scroll, tab bar clearance (`tab-bar-insets`), modals/sheets usable. Desktop block via `MobileGate` → `DesktopOnlyPage`.

---

## Route inventory (30 App Router pages)

| Route | PWA view | Native reference | Status | Notes |
| --- | --- | --- | --- | --- |
| `/` | redirect | — | OK | Entry redirect |
| `/welcome` | `WelcomePage` | `app/(guest)/welcome` | Aligned | Hero + pill CTA, tokens |
| `/sign-in` | `SignInPage` | auth stack | Mostly | `FlowScreen`, `OtpInput`; dashed OTP not pixel-identical |
| `/onboarding` | `OnboardingPage` | onboarding | Aligned | `FlowScreen` |
| `/home` | `HomePage` | home feed | Aligned | Feed cards, banner, search affordance |
| `/activity` | `ActivityPage` | activity | Aligned | Tabs, chips, activity cards |
| `/notifications` | `NotificationsPage` | notifications | Aligned | Filter chips, rows, skeletons |
| `/request/new` | `RequestNewPage` | create/edit request | **Updated** | `FlowScreen`, `MoneyAmountInput`, active tag chips |
| `/request/[id]` | `RequestDetailPage` | request detail | Aligned | `RequestFlowHeader`, `ResponseCard` |
| `/respond/[id]` | `RespondPage` | respond | Aligned | Flow header, money input |
| `/engagement/[id]` | `EngagementPage` | engagement | Aligned | `RequestFlowHeader`, `Card`, report sheet |
| `/rate/[id]` | `RatePage` | rate | Aligned | Star pills `bg-active` |
| `/conversation/[id]` | `ConversationPage` | chat | Mostly | Bubbles, header, attach `BottomSheet`; composer simpler than native |
| `/messages` | `MessagesPage` | messages list | Aligned | Inbox rows (not in tab bar) |
| `/search` | `SearchPage` | search | Aligned | `FlowScreen`, recents |
| `/profile` | `ProfilePage` | `app/profile/index` | Mostly | Theme segment; catalogue rail / tag interests thinner than native |
| `/profile/edit` | `ProfileEditPage` | edit profile | Mostly | `FlowScreen`; camera sheet chrome differs (web file input) |
| `/profile/bank-accounts` | `BankAccountsPage` | bank list | **Updated** | `FlowScreen`, `Card`, ghost actions |
| `/profile/bank-accounts/add` | `BankAccountAddPage` | add bank | **Updated** | `FlowScreen`, native select styling |
| `/wallet` | `WalletPage` | wallet | Mostly | Balance card, activity preview; locked-funds explainer not bottom sheet |
| `/wallet/add` | `WalletAddPage` | deposit amount | **Updated** | `MoneyAmountInput`, preset chips |
| `/wallet/history` | `WalletHistoryPage` | history | **Updated** | `FlowScreen`, list cards |
| `/wallet/deposit/review` | `WalletDepositReviewPage` | pay review | **Updated** | `FlowScreen`, `Card` summary |
| `/wallet/deposit/checkout` | `WalletDepositCheckoutPage` | settlement | **Updated** | `FlowScreen` + settlement component |
| `/wallet/deposit/callback` | `WalletDepositCallbackPage` | — | OK | Loading screen only |
| `/wallet/withdraw` | `WalletWithdrawPage` | withdraw | **Updated** | Bank pickers, money input |
| `/wallet/withdraw/review` | `WalletWithdrawReviewPage` | confirm | **Updated** | NIN block in card |
| `/wallet/withdraw/result` | `WalletWithdrawResultPage` | success | **Updated** | Native-style success card |
| `/wallet/withdrawal/[id]` | `WalletWithdrawalDetailPage` | withdrawal detail | **Updated** | `FlowScreen` |
| `/install` | `InstallAppPage` | install hints | Mostly | Marketing sections; brand back link |

**Native routes not in PWA (functional gap, not styling):** `request/edit/[id]` (PWA uses `?edit=` on `/request/new`), `wallet/transaction/[id]`, `notification-settings`, `profile/locations`.

---

## Shared components added or reused (this pass)

| Component | Role |
| --- | --- |
| `FlowScreen` | Stack screens with `Header` back |
| `RequestFlowHeader` | Request/engagement flows |
| `MoneyAmountInput` | Wallet + offer amounts |
| `ResponseCard` | Request responses list |
| `MessageBubble`, `ConversationHeader`, `ConversationComposer`, `ConversationDateSeparator` | Chat |
| `SectionHeader`, `ThemePreferenceSegment` | Profile/settings |
| `BottomSheet` | Attachments (chat); wallet sheets not fully wired |
| `ToastProvider` | Top toast parity |

---

## Navigation

| Item | PWA | Native | Deviation |
| --- | --- | --- | --- |
| Destinations | Home, Activity, Create, Notifications | Same | — |
| Chrome | `HomeTabBar` fixed + safe area | Liquid glass tabs | **Intentional** — web-friendly bar, same icons/labels/colors |
| Profile / Wallet / Messages | Stack from home/profile | Stack + tabs | Same destinations, no tab entries |

---

## Modals, sheets, toasts

| Surface | Status | Remaining |
| --- | --- | --- |
| Toasts | `ToastProvider` | Verify offset above tab bar on all tab routes |
| `BottomSheet` | Chat attach | Wallet locked funds, request tag/location sheets on create |
| Confirm dialogs | `Button` + inline | Some flows use browser `confirm` — audit if any remain |

---

## Remaining visual deviations (accepted or backlog)

1. **Tab bar** — No glass blur; flat elevated bar with brand/active states (required).
2. **OTP input** — Web `OtpInput` vs native `OtpDashedInput` spacing/size.
3. **Profile home** — Stats grid, horizontal catalogue, report-issue entry vs native `profile/index`.
4. **Request create** — Tag/location pickers still inline vs native bottom sheets.
5. **Wallet** — Locked/pending funds info icon without explanatory sheet.
6. **Chat composer** — Fewer attachment states than native; bubbles match colors.
7. **Camera / live photo** — Web file capture vs native camera sheet (platform).
8. **Install page** — Informational layout, not a native screen.

---

## Automated test results (latest run)

Run after this doc update:

- `pnpm pwa:typecheck` — required pass
- `pnpm pwa:lint` — `--max-warnings 0`
- `pnpm pwa:test` — unit tests
- `pnpm pwa:build` — production build

---

## Regressions

None observed in automated checks when the suite passes. Paystack deposit/withdraw flows unchanged; only layout primitives swapped.

---

## Screenshot QA (manual)

For each row in the route table, capture native (iOS) and PWA (mobile Safari/Chrome) at 390×844 and compare: background, typography scale, primary CTA color (`active`/`brand`), card radius, empty/error states.
