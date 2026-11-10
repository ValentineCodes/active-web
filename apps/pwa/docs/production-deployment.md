# Active PWA — production deployment and rollback

Scope: `apps/pwa` only. Web push / VAPID is **not** implemented. The in-app notification inbox remains the user-facing channel.

## Production URL and website handoff (no `apps/website` changes in this phase)

Deploy the PWA on its **own HTTPS origin**, separate from the marketing site.

| Item | Requirement |
| --- | --- |
| **PWA origin** | Choose a dedicated hostname, e.g. `https://app.<your-domain>` (replace with your production hostname). |
| **Marketing link** | Point CTAs to `{PWA_ORIGIN}/` or `{PWA_ORIGIN}/install` for install instructions. |
| **Scope isolation** | Do **not** serve the PWA `dist/` from the same origin as `apps/website`. The service worker is registered at `/` on the PWA host only. |
| **Paystack** | Allow `{PWA_ORIGIN}/wallet/deposit/callback` in Paystack dashboard alongside existing native callbacks. |

Example website snippet (for a later `apps/website` change):

```html
<a href="https://app.example.com/install">Use Active on your phone</a>
```

## HTTPS and routing

1. TLS certificate on the PWA origin (required for service workers, camera, and installed PWAs).
2. Deploy after `pnpm pwa:build` (`.next/` for Node hosting, or export to your platform’s Next adapter).
3. Run the app with `pnpm pwa:start` (or platform equivalent). App Router serves each URL; you do not need a SPA `index.html` fallback.
4. **Do not** cache authenticated HTML aggressively at the CDN. Prefer long cache on hashed `/_next/static/*` only.

### Illustrative rollback

1. Keep the previous `dist/` artifact in CI (versioned object storage).
2. Redeploy the prior artifact to the PWA origin.
3. Purge CDN cache for `/`, `/index.html`, and `sw.js` if applicable.
4. Users with an open tab may need “Reload now” when the update prompt appears after the next `registration.update()` check.

## Environment (build time)

Set in CI before `pnpm pwa:build`:

- `NEXT_PUBLIC_SUPABASE_URL` (or legacy `VITE_PUBLIC_*` — see `next.config.ts`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon JWT only)

Never embed service-role keys, Paystack secret keys, or VAPID private keys in the browser bundle.

## Web app manifest (generated at build)

Built by Next.js `app/manifest.ts` and Serwist service worker:

| Field | Value |
| --- | --- |
| `name` / `short_name` | Active |
| `description` | Marketplace for Nigeria |
| `id` | `/` |
| `start_url` | `/?source=pwa` |
| `scope` | `/` |
| `display` | `standalone` |
| `orientation` | `any` (phones in landscape remain supported) |
| `theme_color` | `#166A3D` |
| `background_color` | `#FFFFFF` |
| `icons` | `/icons/icon-192.png` (192×192), `/icons/icon-512.png` (512×512, any + maskable) |

Icons are PNG assets in `public/icons/`, generated from the same 1024×1024 brand asset as the native app (read-only copy; `apps/mobile` is not modified).

## Service worker behavior

| Topic | Behavior |
| --- | --- |
| Registration | Serwist `public/sw.js` + `PwaUpdatePrompt` (prompt before `skipWaiting`) |
| Precache | Build output: JS, CSS, HTML shell, favicon, icons, fonts (if emitted) |
| Updates | Hourly `registration.update()`; user must tap **Reload now** to activate (`skipWaiting: false`) |
| Supabase | `NetworkOnly` for `*.supabase.co` |
| Paystack | `NetworkOnly` for `*.paystack.com` / `*.paystack.co` |
| Local API dev | `NetworkOnly` for localhost |
| Navigate fallback | `/index.html` for client routes; **denylist** `/wallet/deposit/callback` so offline fallback does not mask payment return handling |

**Not cached:** authenticated API responses, sessions, wallet balances, profile payloads, chat, signed storage URLs, Edge Function responses, payment verification.

TanStack Query holds in-memory data only for the session; `queryClient.clear()` on sign-out. Session-scoped `sessionStorage` keys (wallet checkout, withdraw idempotency, search recents) are cleared via `clearClientUserState()`.

## Mobile-only gate

`MobileGate` + `evaluateMobileAccess()` block typical desktop (fine pointer + hover at ≥1024px width without touch signals). Narrow viewports and touch devices pass, including **landscape** phones (short edge ≤900px). Desktop users see `DesktopOnlyPage` with the PWA origin URL to open on a phone.

## Install experience

| Platform | UX |
| --- | --- |
| Android Chrome | `beforeinstallprompt` → **Install Active** on `/install`; menu “Install app” also works |
| iOS Safari | No automatic prompt; step-by-step **Add to Home Screen** on `/install` |
| Profile | Link **Install app** → `/install` |

Web push is intentionally omitted; `/install` states that notifications are in-app only.

## Security headers (recommendations — configure on **your** host/CDN)

Adjust `connect-src` / `img-src` if Supabase or storage hostnames differ.

| Header | Recommendation |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (HTTPS only) |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` or `frame-ancestors` | `DENY` or `frame-ancestors 'none'` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(self), geolocation=(self), microphone=()` |

**Content-Security-Policy (starting point — tighten to your Supabase project URL):**

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob: https://*.supabase.co;
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.paystack.com https://*.paystack.co;
frame-src https://*.paystack.com https://*.paystack.co;
base-uri 'self';
form-action 'self' https://*.paystack.com https://*.paystack.co;
object-src 'none';
```

If CSP is enabled, verify Paystack redirect/checkout and Supabase Realtime (`wss://`) in staging before production.

## Runtime concerns (reviewed)

| Area | Notes |
| --- | --- |
| **Camera** | Profile photo uses `getUserMedia` + `confirm_avatar_capture` only; gallery does not satisfy chat eligibility (`profile-photo-policy.ts`). Requires secure context (HTTPS). |
| **Location** | Request posting uses browser geolocation when enabled; permission prompts are per-browser. |
| **Paystack** | Same-tab redirect to Paystack; return to `/wallet/deposit/callback` → checkout verifies via `paystack-verify` only. |
| **Auth** | Chunked `localStorage` session via Supabase client; `detectSessionInUrl: false`; token refresh tied to `visibilitychange`. |
| **Realtime** | Conversation/request channels unsubscribed on navigation; full page sign-out navigates to `/welcome`. |
| **Sign-out / account switch** | `signOut` + `SIGNED_OUT`: `clearClientUserState()`, `queryClient.clear()` — no wallet/search context carried to the next account. |

## Production launch checklist

- [ ] PWA origin on HTTPS, separate from marketing site
- [ ] CI injects `VITE_PUBLIC_*` at build time
- [ ] SPA fallback + static asset caching rules applied
- [ ] Paystack callback URL registered for PWA origin
- [ ] Security headers (or CDN equivalent) applied and smoke-tested
- [ ] Manual device pass: Android install + update prompt reload
- [ ] Manual device pass: iOS Safari A2HS + camera capture
- [ ] Manual device pass: desktop blocked
- [ ] Manual device pass: Paystack deposit return + verify
- [ ] Confirm `apps/mobile` unchanged in release diff

## Testing matrix

### Automated (CI / local — **performed**)

```bash
pnpm pwa:typecheck
pnpm pwa:lint
pnpm pwa:test
pnpm pwa:build
```

Includes unit tests for mobile access gate, deposit callback reference parsing, profile photo policy, and related modules.

### Manual — **required before launch** (not run in this environment)

| Case | Android Chrome | iOS Safari | Desktop |
| --- | --- | --- | --- |
| Fresh visit / sign-in | Manual | Manual | N/A (blocked) |
| Install / A2HS | Manual (prompt + `/install`) | Manual (Safari steps) | N/A |
| Installed launch (`standalone`) | Manual | Manual | N/A |
| App update after deploy | Manual (update banner → reload) | Manual | N/A |
| Offline | Manual (static shell; API errors expected) | Manual | N/A |
| Camera profile photo | Manual | Manual | N/A |
| Paystack return + verify | Manual | Manual | N/A |
| Sign-out / second account | Manual | Manual | N/A |
| SW does not cache private API | Manual (DevTools → Application → Cache Storage) | Manual | N/A |

Do not treat the manual rows as passed until executed on real devices against staging/production.

## Known limitations

- iPadOS “Request Desktop Website” may be blocked by the mobile gate.
- In-app browsers (WhatsApp, Instagram) may block install or camera; users should open in Chrome/Safari.
- No offline marketplace, wallet, or chat — only precached static shell.
- No browser push notifications in this phase.
- Service worker does not run on the marketing website when origins are separated (by design).
