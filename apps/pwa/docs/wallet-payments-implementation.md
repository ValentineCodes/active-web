# PWA wallet & Paystack — implementation report

Scope: `apps/pwa` only. No changes to `apps/mobile`, Supabase schema/RLS/RPCs, or Edge Functions.

## Payment flow (browser)

1. **Add money** — `/wallet/add` → `/wallet/deposit/review` → `paystack-initialize` with `callback_url` = `{origin}/wallet/deposit/callback`.
2. **Same-tab redirect** — `window.location.assign(authorization_url)` to Paystack hosted checkout.
3. **Callback** — `/wallet/deposit/callback?reference=` (or `trxref`) forwards to `/wallet/deposit/checkout?reference=` only; **does not credit locally**.
4. **Verification** — checkout polls `paystack-verify` via `waitForWalletDepositSettlement` until `wallet_credited` or terminal failure; then `invalidateWalletQueries`.

Session storage holds only: deposit reference, optional `returnTo` path, withdraw idempotency context. No secrets.

## Wallet & withdraw

- Balance via `my_wallet` + `list_my_wallet_transactions` (same as native).
- **Accept response** still locks funds server-side; insufficient balance routes to contextual top-up (`walletTopUpPath`).
- **Withdraw** — `wallet-withdraw-request` with idempotency key; NIN via `identity-nin-submit` when `get_public_withdrawal_policy` requires it.
- **Bank accounts** — `paystack-banks`, `paystack-resolve-account`, `insert_user_bank_account` RPC.

## Edge Functions used

| Function | Purpose |
|----------|---------|
| `paystack-initialize` | Start deposit |
| `paystack-verify` | Authoritative deposit settlement |
| `wallet-withdraw-request` | Withdrawal |
| `paystack-banks` | Bank list |
| `paystack-resolve-account` | Account name lookup |
| `identity-nin-submit` | NIN for withdrawals |

Webhooks (`paystack-webhook`) unchanged on server; PWA does not call them.

## RPCs / views

`my_wallet`, `list_my_wallet_transactions`, `list_my_wallet_withdrawals`, `get_my_wallet_withdrawal`, `get_public_withdrawal_policy`, `get_my_identity_status`, `list_my_bank_accounts`, `set_default_user_bank_account`, `delete_user_bank_account`, `insert_user_bank_account` (via edge), `accept_response` (wallet lock).

## Tests

```bash
pnpm pwa:typecheck
pnpm pwa:lint
pnpm pwa:test   # includes deposit-api callback reference test
pnpm pwa:build
```

## Manual verification (requires Paystack test + deployed functions)

| Case | Expected |
|------|----------|
| Successful card payment | Verify returns `wallet_credited`; balance updates |
| User cancels Paystack | No credit; failed / retry on checkout |
| Failed payment | Verify shows failed; wallet unchanged |
| Delayed success | `still_processing` + Check again |
| Repeat callback URL refresh | Idempotent verify; no double credit (server) |
| Accept without balance | Top-up prefill with shortfall |

**Not verified in CI:** Live Paystack test keys, real card charges, webhook timing without test dashboard — run against staging Supabase + test keys on mobile Safari / Android Chrome.

## Native confirmation

`git diff apps/mobile` — no wallet/payment changes in this phase.
