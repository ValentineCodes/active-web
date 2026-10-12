# Paystack environment (Test Mode)

Active uses [Paystack’s REST API](https://paystack.com/docs/api/) from **Supabase Edge Functions** only. Secret keys never ship in the React Native bundle.

## Variables

| Variable                          | Where it lives                    | Required                                   | Purpose                                                                                             |
| --------------------------------- | --------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `PAYSTACK_SECRET_KEY`             | Edge Function secrets only        | Yes                                        | `Authorization: Bearer` for Initialize and Verify. Must start with `sk_test_`.                      |
| `PAYSTACK_PUBLIC_KEY`             | Edge Function secrets only        | Yes                                        | Loaded for test-mode validation. Not sent to the mobile client (checkout uses `authorization_url`). |
| `PAYSTACK_BASE_URL`               | Edge Function secrets             | No (defaults to `https://api.paystack.co`) | Paystack API base URL.                                                                              |
| `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY` | Expo `.env` (optional, not wired) | No                                         | Not used; checkout opens Paystack via `authorization_url` from `paystack-initialize`.               |

Supabase Edge Functions also require (injected automatically when serving/deploying):

| Variable                    | Source                                                                       |
| --------------------------- | ---------------------------------------------------------------------------- |
| `SUPABASE_URL`              | Supabase CLI / dashboard                                                     |
| `SUPABASE_ANON_KEY`         | Supabase CLI / dashboard                                                     |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase CLI / dashboard (verify credits wallet via `wallet_record_deposit`) |

Expo app (existing):

| Variable                        | Purpose                           |
| ------------------------------- | --------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`      | Supabase project URL              |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (RLS-protected) |

## Local development

1. Copy `.env.example` to `.env` in the project root and fill in Supabase + Paystack **test** keys from the Paystack dashboard.
2. Start Supabase: `pnpm db:start`
3. Serve functions with the same env file:

   ```bash
   supabase functions serve --env-file .env
   ```

   `supabase/config.toml` maps Paystack keys through `[edge_runtime.secrets]` using `env(PAYSTACK_…)`.

4. In the app: **Wallet → Add money → review → Paystack checkout → confirming**. The app never credits the wallet locally; it polls `paystack-verify` until the server reports `wallet_credited`.

   Edge API (authenticated JWT):

   - `POST /functions/v1/paystack-initialize` — body `{ "amount_naira": 1000, "callback_url": "active://wallet/deposit/callback" }`
   - `POST /functions/v1/paystack-verify` — body `{ "reference": "<active or paystack reference>" }` (JWT). Calls Paystack Verify API server-side and runs the same idempotent settlement as the webhook.

The app **checkout** screen only polls `paystack-verify` after Paystack returns; it never credits locally from the redirect alone.

- `POST /functions/v1/paystack-webhook` — Paystack server only (no JWT); configure in Paystack dashboard

## Webhook (hosted)

Register in Paystack Dashboard → Settings → Webhooks:

`https://<project-ref>.supabase.co/functions/v1/paystack-webhook`

Events: **`charge.success`**. Signature is validated with `PAYSTACK_SECRET_KEY` (HMAC SHA512).

For local webhook testing, expose functions with a tunnel (e.g. ngrok) and point Paystack test webhooks at your tunnel URL.

Deploy all three functions:

```bash
supabase functions deploy paystack-initialize
supabase functions deploy paystack-verify
supabase functions deploy paystack-webhook
```

## Security rules enforced in code

- `loadPaystackConfig()` rejects non–test-mode keys (`sk_test_` / `pk_test_` only).
- Secret key is read only inside Edge Functions (`Deno.env.get`).
- No Paystack secret logging.
- Verify and webhook both call shared deposit settlement (`settleDepositFromPaystack`) idempotently after Paystack `success`, NGN currency, amount, and user/deposit metadata checks.
- Webhook validates `x-paystack-signature` (HMAC SHA512, timing-safe compare) before parsing the body; unsigned or invalid signatures are rejected with `401`.
- Repeated webhooks for the same charge return `200` with `already_fulfilled: true` and do not double-credit (`wallet_record_deposit` + completed deposit row).
- The mobile app only opens Paystack checkout and polls verify; it does not mutate balances.

## Shared Paystack client

Implementation lives under `supabase/functions/_shared/paystack/`:

- `env.ts` — configuration and test-mode guard
- `types.ts` — API payloads
- `client.ts` — `PaystackClient.initializeTransaction()` and `PaystackClient.verifyTransaction()`
- `webhook.ts` — signature verification

Deposit settlement: `supabase/functions/_shared/deposit/settle.ts`

Edge entrypoints:

- `supabase/functions/paystack-initialize/`
- `supabase/functions/paystack-verify/`
- `supabase/functions/paystack-webhook/`

Not implemented: transfers, Dedicated Virtual Accounts, live (`sk_live_`) keys.
