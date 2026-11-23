# PWA guest marketplace — architecture and manual tests

Scope: `apps/pwa` only. Backend contracts live in `supabase/migrations/20261222000000_guest_marketplace_read.sql` and `supabase/tests/guest_marketplace_read.test.sql`.

## Public routes (no session required)

| Route | Shell | Read path |
| --- | --- | --- |
| `/`, `/home` | `SessionHydration` → `PublicMarketplace` | `browse_open_requests`, nearby/search variants |
| `/search` | Tab shell | `search_discover`, `search_requests` (when location available) |
| `/request/:id`, `/respond/:id` | Detail | `browse_request` (guest deep link uses reference coords, not device GPS) |
| `/project/:id` | Detail | `browse_project` (anon only; authenticated callers use `get_project`) |
| `/u/:username` | Detail | `get_public_profile` |
| `/sign-in`, `/install` | Guest / static | — |
| `/welcome` | Redirect | → `/home` (legacy bookmark) |

Protected destinations (wallet, messages, engagements, assignments, settings, etc.) still use `RequireAuthLayout` → `/home` unless listed below as **contextual gates**.

## Five contextual authentication gates

| # | Action | Entry point | Pending action | Resume |
| --- | --- | --- | --- | --- |
| 1 | Own profile | Home header avatar (signed-in only); direct `/profile` | `profile` | `/profile` |
| 2 | Respond | `RespondPage` → “Sign in to respond” | `respond` + request UUID | `/request/:id?start=1` (flow opens; user confirms) |
| 3 | Contribute | `ProjectFundingCard` contribute (public funding) | `contribute` + project UUID | `/project/:id?contribute=1` (modal opens; user confirms amount) |
| 4 | Create | Tab bar **+** | `create` (optional choice) | `/request/new`, `/project/new`, or create sheet on `/home` |
| 5 | Notifications | Tab bar bell (guest button) | `notifications` | `/notifications` |

Prompt UI: `ContextualAuthSheet` (`BottomSheet`) — headline “You need an Active account to continue”, primary **Sign up with phone number**, terms copy in-sheet, footer **Log in**. Intent: `sessionStorage` key `active:pending-auth-action` (30‑minute TTL, validated UUIDs/paths).

**Sign up** and **Log in** both open `/sign-in` (phone OTP). Agreement is shown in the sheet (no separate welcome screen). Pending action is kept until dismiss or successful resume. No extra gates on wallet, messages, or settings.

## Guest read security (client)

- `useHasSession()` / `useOptionalUserId()` gate wallet, `my_*` queries, notifications unread, discovery coordinate persistence, and assignment/activity RPCs.
- Guests do not call `record_discovery_coordinates` (see `browse-api.ts`).
- Respond/contribute mutations are unreachable without a session; resume query params open UI only.

## Guest manual test checklist

Use a **fresh profile / incognito** session and HTTPS (`pnpm pwa:dev`).

### Browsing

1. Open `/` → lands on `/home` with **Good morning/afternoon/evening** only (no avatar, wallet, or name).
2. Scroll Home feed (open browse RPCs).
3. Search with a non-empty query (`search_discover`).
4. Open a public request, project, and `/u/:username` from results or deep links.
5. Refresh each URL — content reloads without a full-app auth wall.

### Gates

6. Tab **+** → contextual sheet → dismiss via backdrop, drag, or close (no extra footer control).
7. Tab bell → sheet → **Log in** → OTP → resume notifications when onboarded.
8. On request detail → **Sign in to respond** → OTP → lands on request with respond flow (no auto-submit).
9. On public project → **Contribute** → OTP → modal opens, no wallet debit until confirm.
10. Navigate to `/profile` as guest → redirected to `/home` with profile prompt.

### Authenticated regression (signed-in tab)

11. Home header shows avatar, name, wallet.
12. Create opens choice sheet; notifications badge works.
13. Respond / contribute / profile work without the guest sheet.

## Automated tests

```bash
pnpm pwa:typecheck
pnpm pwa:test
pnpm pwa:build
supabase test db supabase/tests/guest_marketplace_read.test.sql
```