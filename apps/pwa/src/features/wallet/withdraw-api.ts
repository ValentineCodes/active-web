import { readEdgeFunctionPayload } from '@/lib/supabase/function-invoke';
import { supabase } from '@/lib/supabase/client';

export type WithdrawRequestResult = {
  status: 'pending' | 'processing';
  withdrawal_id?: string;
  withdrawal_transaction_id: string;
  message: string;
  transfer_settlement: 'pending';
};

export type WithdrawRequestErrorCode =
  | 'insufficient_balance'
  | 'invalid_bank_account'
  | 'invalid_amount'
  | 'withdrawal_in_progress'
  | 'withdrawals_disabled'
  | 'identity_verification_required'
  | 'unknown';

export async function requestWalletWithdrawal(input: {
  amountMajor: number;
  bankAccountId: string;
  idempotencyKey: string;
}): Promise<WithdrawRequestResult> {
  const { data, error } = await supabase.functions.invoke('wallet-withdraw-request', {
    body: {
      amount_naira: input.amountMajor,
      bank_account_id: input.bankAccountId,
      idempotency_key: input.idempotencyKey,
    },
  });

  return readEdgeFunctionPayload<WithdrawRequestResult>(data, error, {
    functionName: 'wallet-withdraw-request',
  });
}

export function withdrawErrorCode(error: unknown): WithdrawRequestErrorCode {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: string }).code;
    if (
      code === 'insufficient_balance' ||
      code === 'invalid_bank_account' ||
      code === 'invalid_amount' ||
      code === 'withdrawal_in_progress' ||
      code === 'withdrawals_disabled' ||
      code === 'identity_verification_required'
    ) {
      return code;
    }
  }

  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (lower.includes('insufficient available balance')) return 'insufficient_balance';
    if (lower.includes('bank account not found')) return 'invalid_bank_account';
    if (
      lower.includes('minimum withdrawal') ||
      lower.includes('per-withdrawal limit') ||
      lower.includes('daily withdrawal limit')
    ) {
      return 'invalid_amount';
    }
    if (lower.includes('withdrawal in progress')) return 'withdrawal_in_progress';
    if (lower.includes('withdrawals are temporarily disabled')) return 'withdrawals_disabled';
    if (lower.includes('identity verification')) return 'identity_verification_required';
  }

  return 'unknown';
}
