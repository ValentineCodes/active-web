import { supabase } from '@/lib/supabase/client';

export type WithdrawRequestResult = {
  status: 'pending';
  withdrawal_transaction_id: string;
  message: string;
  transfer_settlement: 'pending';
};

export type WithdrawRequestErrorCode =
  | 'insufficient_balance'
  | 'invalid_bank_account'
  | 'invalid_amount'
  | 'withdrawal_in_progress'
  | 'unknown';

type ErrorBody = {
  status?: 'error';
  code?: WithdrawRequestErrorCode;
  error?: string;
};

async function parseInvokeError(error: unknown): Promise<Error | null> {
  if (!error || typeof error !== 'object' || !('context' in error)) return null;
  const response = (error as { context?: Response }).context;
  if (!response?.json) return null;
  try {
    const body = (await response.json()) as ErrorBody;
    if (!body.error) return null;
    const err = new Error(body.error);
    if (body.code) {
      (err as Error & { code?: WithdrawRequestErrorCode }).code = body.code;
    }
    return err;
  } catch {
    return null;
  }
}

function throwIfErrorBody(data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const body = data as ErrorBody;
  if (body.status === 'error' && body.error) {
    const err = new Error(body.error);
    if (body.code) {
      (err as Error & { code?: WithdrawRequestErrorCode }).code = body.code;
    }
    throw err;
  }
}

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

  if (error) {
    const parsed = await parseInvokeError(error);
    throw parsed ?? error;
  }

  throwIfErrorBody(data);

  if (!data || typeof data !== 'object' || (data as WithdrawRequestResult).status !== 'pending') {
    throw new Error('Unexpected withdrawal response');
  }

  return data as WithdrawRequestResult;
}

export function withdrawErrorCode(error: unknown): WithdrawRequestErrorCode {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: string }).code;
    if (
      code === 'insufficient_balance' ||
      code === 'invalid_bank_account' ||
      code === 'invalid_amount' ||
      code === 'withdrawal_in_progress'
    ) {
      return code;
    }
  }
  return 'unknown';
}
