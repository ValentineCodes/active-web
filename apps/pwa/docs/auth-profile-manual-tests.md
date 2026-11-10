# PWA auth & profile — manual tests (real devices)

Run against `pnpm pwa:dev` on HTTPS or a trusted LAN host (camera requires secure context).

## Phone OTP (Mobile Safari / Android Chrome)

1. Open `/welcome` → Agree and continue → enter valid test OTP phone.
2. Receive SMS, enter 6-digit code → land on onboarding or home.
3. Sign out from Profile → confirm return to welcome; session cleared on reload.

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
