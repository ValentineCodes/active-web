import type { SupabaseClient } from '@supabase/supabase-js';

export type DepositSettlementResult = {
  status: 'completed' | 'failed' | 'pending';
  walletCredited: boolean;
  alreadyFulfilled: boolean;
};

export type PaystackDepositSettlement = {
  paystackAmountKobo: number;
  paystackReference: string;
  currency: string;
  paystackStatus: string;
  metadataUserId: string;
  metadataDepositId: string | null;
};

export class DepositSettlementError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'unknown_deposit'
      | 'invalid_amount'
      | 'amount_mismatch'
      | 'currency_mismatch'
      | 'not_successful'
      | 'user_mismatch'
      | 'deposit_mismatch',
  ) {
    super(message);
    this.name = 'DepositSettlementError';
  }
}

export type DepositForSettlement = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  currency: string;
};

export function validatePaystackDepositSettlementForCredit(
  deposit: DepositForSettlement,
  settlement: PaystackDepositSettlement,
): 'already_fulfilled' | 'ready' {
  if (deposit.status === 'completed') {
    return 'already_fulfilled';
  }

  if (settlement.paystackStatus !== 'success') {
    throw new DepositSettlementError('Paystack transaction not successful', 'not_successful');
  }

  const paystackCurrency = settlement.currency.trim().toUpperCase();
  if (paystackCurrency !== 'NGN') {
    throw new DepositSettlementError('Paystack currency is not NGN', 'currency_mismatch');
  }

  if (deposit.currency !== 'NGN') {
    throw new DepositSettlementError('Deposit currency is not NGN', 'currency_mismatch');
  }

  if (settlement.metadataUserId !== deposit.user_id) {
    throw new DepositSettlementError('Deposit user does not match metadata', 'user_mismatch');
  }

  if (settlement.metadataDepositId && settlement.metadataDepositId !== deposit.id) {
    throw new DepositSettlementError('Deposit id does not match metadata', 'deposit_mismatch');
  }

  if (!Number.isInteger(settlement.paystackAmountKobo) || settlement.paystackAmountKobo <= 0) {
    throw new DepositSettlementError('Invalid Paystack amount', 'invalid_amount');
  }

  if (settlement.paystackAmountKobo !== deposit.amount) {
    throw new DepositSettlementError(
      'Paystack amount does not match deposit intent',
      'amount_mismatch',
    );
  }

  return 'ready';
}

/** Idempotent wallet credit after Paystack reports a successful charge. */
export async function settleDepositFromPaystack(
  service: SupabaseClient,
  activeReference: string,
  settlement: PaystackDepositSettlement,
): Promise<DepositSettlementResult> {
  const { data: deposit, error: depositError } = await service
    .from('deposit_transactions')
    .select('id, user_id, amount, status, currency')
    .eq('reference', activeReference)
    .maybeSingle();

  if (depositError) {
    throw new Error(depositError.message);
  }

  if (!deposit) {
    throw new DepositSettlementError('Unknown deposit reference', 'unknown_deposit');
  }

  const validation = validatePaystackDepositSettlementForCredit(deposit, settlement);
  if (validation === 'already_fulfilled') {
    return { status: 'completed', walletCredited: true, alreadyFulfilled: true };
  }

  const { error: creditError } = await service.rpc('wallet_record_deposit', {
    p_user_id: deposit.user_id,
    p_amount_kobo: settlement.paystackAmountKobo,
    p_idempotency_key: activeReference,
    p_paystack_reference: settlement.paystackReference,
  });

  if (creditError) {
    throw new Error(creditError.message);
  }

  return { status: 'completed', walletCredited: true, alreadyFulfilled: false };
}

export async function markDepositFailed(service: SupabaseClient, reference: string): Promise<void> {
  await service
    .from('deposit_transactions')
    .update({ status: 'failed' })
    .eq('reference', reference)
    .eq('status', 'pending');
}
