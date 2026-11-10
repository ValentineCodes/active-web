# PWA ↔ native design parity

Scope: `apps/pwa` only. Visual and layout alignment with `apps/mobile` (light theme).

## Shared foundation (done)

- **Tokens**: `tokens.css` + Tailwind `@theme` (Poppins, brand greens, shadows `shadow-card` / `shadow-raised`).
- **UI primitives**: `Button`, `TextField`, `Avatar`, `Card`, `Badge`, `Header`, `Screen`, `IconButton`, `IonIcon` (ionicons v8), `StateView` (`LoadingState`, `EmptyState`, `InlineError`, `SuccessBanner`), `Skeleton`.
- **Tab chrome**: `HomeTabBar` — Home, Activity, Create, Notifications (icons + badges); matches native tab model (no Chat/Profile in tab bar).
- **Layouts**: `FlowScreen` for stack flows (`Header` + scroll body).

## Screens aligned in this pass

| Area | Parity notes |
| --- | --- |
| **Home** | `HomeFeedHeader`, `HomeActiveRequestBanner`, full-bleed snap feed cards (`HomeFeedRequestPage`), floating search control. |
| **Activity** | `text-3xl` title, My Requests / My Responses tabs, status filter chips, `ActivityMyRequestCard` / `ActivityMyResponseCard`. |
| **Notifications** | Inbox filter, chip rows, mark-all-read, skeletons. |
| **Welcome** | Native hero + pill CTA. |
| **App shell** | No marketing header; `100dvh` column layout. |

## Remaining gaps (next passes)

These native areas still use simpler PWA markup and should be ported incrementally:

- **Auth**: `SignInPage`, `OtpInput` → native `OtpDashedInput` / `AuthFooterButton`.
- **Profile / onboarding**: stats grid, edit flows, live camera sheet chrome.
- **Wallet**: balance card, locked-funds sheet, `WalletActivityRow`, money input (`MoneyAmountInput`).
- **Request / respond / engagement**: `RequestFlowHeader`, tag sheets, location modals, completion proof UI.
- **Conversation**: `ConversationHeader`, `MessageBubble`, composer, attachment viewers.
- **Search**, **Messages** (inbox route kept; not in tab bar), **Rate**, bank-account sheets.

When porting a screen: wrap in `Screen` or `FlowScreen`, use `Header`, prefer `Card`/`Badge`/`Button` variants, and match native class names from the parallel file under `apps/mobile`.

## Verification

```bash
pnpm pwa:typecheck
pnpm pwa:lint
pnpm pwa:test
pnpm pwa:build
```

Manual: compare Home, Activity, Notifications, and tab bar side-by-side with native (light mode).
