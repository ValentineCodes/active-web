# Active PWA (`@active/pwa`)

Mobile-first Progressive Web App for the Active marketplace. It shares the Supabase backend with the native app but is a **separate** Next.js + React codebase. It does not import from `apps/mobile`.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) (workspace uses `pnpm@11.24.0`)
- A Supabase project (local `pnpm db:start` or hosted)

## Environment variables

Copy the example file and set the **anon JWT** (not the publishable key):

```bash
cp apps/pwa/.env.example apps/pwa/.env
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL (`VITE_PUBLIC_*` and root `EXPO_PUBLIC_*` still work at build via `next.config.ts`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (`eyJ…`) — RLS protects all data |

For local dev you can mirror the Expo app values:

```bash
# From repo root, if .env already has EXPO_PUBLIC_* keys:
grep '^EXPO_PUBLIC_SUPABASE_' .env | sed 's/EXPO_PUBLIC_/VITE_PUBLIC_/' > apps/pwa/.env
```

Never commit `apps/pwa/.env` or put service-role keys in the browser bundle.

## Scripts (from repo root)

```bash
pnpm pwa:dev          # http://localhost:3002
pnpm pwa:build
pnpm pwa:preview
pnpm pwa:typecheck
pnpm pwa:lint
pnpm pwa:test
```

Or from this directory: `pnpm dev`, `pnpm build`, etc.

## Current scope

- Full marketplace flows (requests, chat, wallet/Paystack, profile) for mobile browsers and installed PWAs
- Phone **SMS OTP** sign-in (same Supabase Auth flow as native)
- Onboarding (name/bio), profile view/edit, **live camera** profile photo → `confirm_avatar_capture`
- Notification **inbox** (no web push / VAPID in this phase)
- Mobile-only gate, install instructions (`/install`), service worker with user-controlled updates

Manual checks: [`docs/auth-profile-manual-tests.md`](docs/auth-profile-manual-tests.md), [`docs/production-manual-tests.md`](docs/production-manual-tests.md).

Production deployment, CSP, rollback: [`docs/production-deployment.md`](docs/production-deployment.md).

## Architecture (foundation phase)

- **Vite 8** + **React 19** + **Tailwind CSS 4**
- **React Router 7** — SPA routing, error boundaries
- **TanStack Query** — data layer for upcoming marketplace modules
- **Supabase JS** — browser client with chunked `localStorage` session storage (not SecureStore)
- **vite-plugin-pwa** — manifest + service worker (static precache only; Supabase traffic is `NetworkOnly`)

## Mobile-only gate

Access is allowed when touch/viewport signals indicate a phone, including **landscape** (short edge ≤ 900px). Typical fine-pointer desktop layouts at ≥ 1024px width are blocked. See `src/device/mobile-access.ts` for heuristics and limitations (iPad desktop mode, DevTools emulation).

## PWA install

- Route: `/install` (also linked from Profile)
- **Android Chrome**: install prompt when eligible; same-origin HTTPS required
- **iOS Safari**: no automatic install API — in-app steps for Share → Add to Home Screen
- **Updates**: banner “Update available” → user taps **Reload now** (`registerType: 'prompt'`)
- Web push is **not** implemented in this phase

## Deployment

See [`docs/production-deployment.md`](docs/production-deployment.md) for HTTPS, SPA routing, Paystack callback URL, security headers, website link requirements, launch checklist, and rollback.

## Native app safety

This package must not add dependencies on `expo` or `react-native`. Changes to `apps/mobile` are out of scope for PWA work unless explicitly approved.
