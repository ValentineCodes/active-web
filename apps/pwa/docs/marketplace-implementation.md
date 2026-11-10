# PWA marketplace — implementation report

Scope: marketplace flows in `apps/pwa` only, using existing Supabase contracts. Wallet/Paystack UI and deployment hardening are out of scope.

## Feature matrix

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Profile & account settings | **Partial** | `/profile`, `/profile/edit`, live camera avatar. No notification-tag interests UI, saved locations, or NIN flow. |
| 2 | Request create / edit | **Partial** | `/request/new` single-page form (title, description, offer, tags, location, optional photo). Edit via `?edit=` not fully hydrated from server. No multi-step wizard or funding/wallet gate UI. |
| 3 | Browse & discovery | **Complete** | Home infinite feed (`browse_open_requests`, `browse_nearby_requests`, `record_discovery_coordinates`). |
| 4 | Search & tags | **Partial** | `/search` + home `q=` param (`search_requests`). Tag picker on create; no dedicated home tag filter chips. |
| 5 | Request details & approximate location | **Partial** | Respond flow shows coarse `location_label` / proximity; owner view on `/request/:id`. |
| 6 | Responses & counteroffers | **Complete** | `respond_to_request`, optional quote/message; withdraw. |
| 7 | Requester accept / decline | **Partial** | `accept_response`, `decline_response`, pre-handshake chat. No extend-deadline UI; accept may fail without wallet top-up UI. |
| 8 | Assignment / engagement | **Partial** | `/engagement/:id` via `get_engagement` (exact location + phone post-accept). |
| 9 | Conversations | **Partial** | Inbox, `/conversation/:id`, realtime hooks, text send. Attachments upload; limited inline preview. |
| 10 | Media attachments | **Partial** | Request photos, chat image/video/file (browser pickers). No attachment gallery viewer. |
| 11 | Notification inbox | **Complete** | Prior phase (`/notifications`). |
| 12 | Completion & confirmation | **Partial** | `mark_service_complete`, `complete_request`. No completion-proof media UI. |
| 13 | Reports / disputes | **Partial** | `report_service_problem` from engagement. No full dispute timeline / contest UI. |

## Backend contracts (RPCs / storage)

- **Browse:** `browse_open_requests`, `browse_nearby_requests`, `search_requests`, `browse_request`, `record_discovery_coordinates`
- **Requests (requester):** `create_request`, `update_request`, `list_request_responses`, `accept_response`, `decline_response`, `extend_request`, `complete_request`, `get_engagement`, `report_service_problem`, `contest_service_problem`, `rate_request`
- **Responses:** `respond_to_request`, `withdraw_response`, `mark_service_complete`, `start_request`
- **Chat:** `list_my_request_conversations`, `open_pre_handshake_conversation`, `resolve_request_conversation`, `list_request_messages`, `send_request_message`, `begin_request_message_with_attachments`, `complete_request_message_with_attachments`, `abort_request_message_with_attachments`
- **Profile / tags:** `list_tag_catalogue`, `confirm_avatar_capture`, profiles table
- **Notifications:** inbox queries from prior phase
- **Storage:** `avatars`, `request-media`, `conversation-media`

## Tests run

```bash
pnpm pwa:typecheck
pnpm pwa:lint
pnpm pwa:test   # 11 tests
pnpm pwa:build
```

## Known gaps

- No wallet/deposit UI — `accept_response` may return insufficient-balance errors.
- Request edit route does not pre-fill from `useMyRequest`.
- No cancellation UI (aligned with native app surface).
- Chat attachment download/signed URL viewer not built.
- Reverse geocode for area label is manual entry only.
- Native parity components (bottom sheets, extend deadline, completion proof, rich profile sheets) not ported.

## Manual test checklist

**iOS Safari / Android Chrome (mobile viewport)**

1. Sign in → complete onboarding → capture **live** profile photo (gallery must not qualify).
2. Home → allow location when tapping “Sort by nearest” → verify nearby feed loads.
3. Search → run query → home shows search results.
4. Post request → tags → location → appears under Activity.
5. Second account (or test responder) → respond with optional counteroffer.
6. Requester → `/request/:id` → message before accept → accept (wallet funded) → engagement shows phone + map link.
7. Chat → send text, photo, PDF; verify realtime on second device/tab.
8. Helper marks complete → requester confirms completion → rate.
9. Report problem on in-progress engagement.
10. Notifications tab still loads; service worker does not cache private API responses (verify offline: static shell only).
