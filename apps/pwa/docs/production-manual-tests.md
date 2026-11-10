# PWA production manual test script

Run against a **HTTPS** staging or production PWA origin after `pnpm pwa:build` deploy. Record pass/fail per device. Automated checks are in `pnpm pwa:test` — this document is **manual only**.

## Android Chrome

1. Open `{PWA_ORIGIN}/welcome` — sign in with SMS OTP.
2. Profile → **Install app** — use **Install Active** when prompted (or browser menu).
3. Launch from home screen — verify standalone chrome (no URL bar).
4. Toggle airplane mode — reload; app shell may load but home feed should error (no cached Supabase JSON).
5. Deploy a new build — within ~1h or after focus refresh, confirm **Update available** → **Reload now**.
6. Wallet deposit: complete Paystack test flow; confirm balance after verify on checkout page.
7. Sign out → sign in as different test user — wallet balance must match new user only.

## iOS Safari

1. Open `{PWA_ORIGIN}` in Safari (not in-app browser).
2. Follow `/install` steps: Share → Add to Home Screen → launch icon.
3. Profile → **Take profile photo** — allow camera; confirm `avatar_captured_in_app` enables chat.
4. Deny camera once — confirm actionable error message.
5. After new deploy, confirm update banner and reload.
6. Paystack deposit return from Safari — callback → checkout verification.

## Desktop

1. Chrome or Safari at ≥1024px with mouse — **Use a mobile device** message, no marketplace routes.
2. Resize below gate or use touch device — app loads normally.

## Service worker / privacy

1. DevTools → Application → Cache Storage — only Workbox precache + no Supabase response bodies.
2. Network tab — Supabase calls show `(from service worker)` only for static assets, not REST.

## Native isolation

From repo root: `git diff apps/mobile` must be empty for the PWA production release branch.
