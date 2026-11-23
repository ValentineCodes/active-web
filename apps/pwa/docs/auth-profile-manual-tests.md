# PWA auth & profile — manual tests (real devices)

Run against `pnpm pwa:dev` on HTTPS or a trusted LAN host (camera requires secure context).

## Guest marketplace (incognito)

See [guest-marketplace.md](./guest-marketplace.md) for the full browse + five-gate checklist. Quick smoke:

1. Incognito → `/home` → time-only header, feed loads.
2. Tab **+** and bell → contextual auth sheet (not immediate redirect away from marketplace).
3. Dismiss the sheet (backdrop or close); marketplace remains usable.
4. Sign in from sheet → OTP → onboarding if needed → resume (notifications, respond flow, or contribute modal without auto-submit).
5. `/u/:username` loads with no auth prompt; `/profile` as guest → home + profile prompt.

## Phone OTP (Mobile Safari / Android Chrome)

1. From contextual sheet or `/sign-in`, enter valid test OTP phone.
2. Receive SMS, enter 6-digit code → land on onboarding or home.
3. Sign out from Profile → confirm return to `/home`; session cleared on reload.

## Multi-tab session

1. Sign in on tab A.
2. Open tab B on same origin → should show signed-in state without re-entering OTP.
3. Sign out on tab A → tab B should drop session within a few seconds (storage event).

## Profile onboarding

1. New user completes name (2–60 chars) and optional bio → home.
2. Skip photo on onboarding → profile shows photo not ready.

## Live profile photo (required: real phone)

1. Profile or onboarding → **Take profile photo**.
2. Allow camera → preview shows front camera (not file picker).
3. Capture → profile shows photo; `avatar_captured_in_app` satisfied server-side via `confirm_avatar_capture`.
4. Deny camera permission → inline error with settings guidance; no upload.
5. Confirm there is **no** “choose from gallery” path that calls `confirm_avatar_capture`.

## Notification inbox

1. Signed-in user with inbox rows → `/notifications` lists items.
2. Tap unread row → marks read via `mark_notification_inbox_item_read` (refresh updates).

## Desktop gate

1. Wide fine-pointer browser → desktop-only message (not auth screens).
