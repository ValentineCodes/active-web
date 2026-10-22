import { type Href } from 'expo-router';

export const WALLET_WITHDRAW_RETURN_TO = '/wallet/withdraw';

export const WITHDRAW_AMOUNT_PARAM = 'amount';
export const WITHDRAW_BANK_ACCOUNT_ID_PARAM = 'bankAccountId';

export function withdrawScreenParams(input: {
  amount?: string;
  bankAccountId?: string;
}): Record<string, string> {
  const params: Record<string, string> = {};
  if (input.amount?.trim()) {
    params[WITHDRAW_AMOUNT_PARAM] = input.amount.trim();
  }
  if (input.bankAccountId?.trim()) {
    params[WITHDRAW_BANK_ACCOUNT_ID_PARAM] = input.bankAccountId.trim();
  }
  return params;
}

export function addBankAccountHrefFromWithdraw(draft: {
  amount: string;
  bankAccountId: string | null;
}): Href {
  const returnTo = buildWithdrawReturnTo(draft);
  return `/profile/bank-accounts/add?returnTo=${encodeURIComponent(returnTo)}` as Href;
}

export function buildWithdrawReturnTo(draft: {
  amount: string;
  bankAccountId: string | null;
}): string {
  const params = new URLSearchParams();
  const amount = draft.amount.replace(/[^\d]/g, '');
  if (amount) params.set(WITHDRAW_AMOUNT_PARAM, amount);
  if (draft.bankAccountId) params.set(WITHDRAW_BANK_ACCOUNT_ID_PARAM, draft.bankAccountId);
  const query = params.toString();
  return query ? `${WALLET_WITHDRAW_RETURN_TO}?${query}` : WALLET_WITHDRAW_RETURN_TO;
}

export function readWithdrawDraftFromParams(params: {
  amount?: string;
  bankAccountId?: string;
}) {
  const amountRaw = params.amount?.replace(/[^\d]/g, '') ?? '';
  return {
    amount: amountRaw,
    bankAccountId: params.bankAccountId ?? null,
  };
}

export function withdrawReviewHref(input: { amount: string; bankAccountId: string }): Href {
  const params = new URLSearchParams();
  params.set(WITHDRAW_AMOUNT_PARAM, input.amount.replace(/[^\d]/g, ''));
  params.set(WITHDRAW_BANK_ACCOUNT_ID_PARAM, input.bankAccountId);
  return `/wallet/withdraw/review?${params.toString()}` as Href;
}
