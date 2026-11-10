import { clearPendingWithdrawSubmission } from '@/features/wallet/withdraw-pending';

export const WALLET_WITHDRAW_RETURN_TO = '/wallet/withdraw';

export const WITHDRAW_AMOUNT_PARAM = 'amount';
export const WITHDRAW_BANK_ACCOUNT_ID_PARAM = 'bankAccountId';

export function readWithdrawDraftFromSearch(search: URLSearchParams) {
  const amountRaw = (search.get(WITHDRAW_AMOUNT_PARAM) ?? '').replace(/[^\d]/g, '');
  return {
    amount: amountRaw,
    bankAccountId: search.get(WITHDRAW_BANK_ACCOUNT_ID_PARAM),
  };
}

export function buildWithdrawReviewPath(input: { amount: string; bankAccountId: string }): string {
  const params = new URLSearchParams();
  params.set(WITHDRAW_AMOUNT_PARAM, input.amount.replace(/[^\d]/g, ''));
  params.set(WITHDRAW_BANK_ACCOUNT_ID_PARAM, input.bankAccountId);
  return `/wallet/withdraw/review?${params.toString()}`;
}

export function bankAccountAddPathFromWithdraw(draft: {
  amount: string;
  bankAccountId: string | null;
}): string {
  const params = new URLSearchParams();
  const amount = draft.amount.replace(/[^\d]/g, '');
  if (amount) params.set(WITHDRAW_AMOUNT_PARAM, amount);
  if (draft.bankAccountId) params.set(WITHDRAW_BANK_ACCOUNT_ID_PARAM, draft.bankAccountId);
  const returnTo = params.toString()
    ? `${WALLET_WITHDRAW_RETURN_TO}?${params.toString()}`
    : WALLET_WITHDRAW_RETURN_TO;
  return `/profile/bank-accounts/add?returnTo=${encodeURIComponent(returnTo)}`;
}

export function clearWithdrawNavigationState(): void {
  clearPendingWithdrawSubmission();
}
