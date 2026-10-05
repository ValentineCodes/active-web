import type { SupabaseClient } from '@supabase/supabase-js';

import type { PaystackClient } from '../paystack/client.ts';
import { parseWalletDepositMetadata } from '../paystack/webhook.ts';
import type { VerifyTransactionData } from '../paystack/types.ts';
import { findDepositByPaymentReference, type DepositRecord } from './lookup.ts';
import {
  DepositSettlementError,
  markDepositFailed,
  settleDepositFromPaystack,
  type PaystackDepositSettlement,
} from './settle.ts';

export type VerifyWalletDepositResult = {
  status: string;
  reference: string;
  amount_kobo: number;
  currency?: string;
  paid_at?: string | null;
  channel?: string | null;
  wallet_credited: boolean;
  deposit_status: string;
  already_fulfilled?: boolean;
  fulfillment_rejected?: boolean;
  rejection_reason?: string;
};

function settlementFromPaystackVerify(
  deposit: DepositRecord,
  verified: VerifyTransactionData,
): PaystackDepositSettlement {
  const parsed = parseWalletDepositMetadata(verified.metadata);
  const metadataUserId = parsed?.userId ?? deposit.user_id;
  const metadataDepositId = parsed?.depositId ?? deposit.id;

  return {
    paystackAmountKobo: verified.amount,
    paystackReference: verified.reference,
    currency: verified.currency,
    paystackStatus: verified.status,
    metadataUserId,
    metadataDepositId,
  };
}

function resultFromCompletedDeposit(deposit: DepositRecord): VerifyWalletDepositResult {
  return {
    status: 'success',
    reference: deposit.reference,
    amount_kobo: deposit.amount,
    currency: deposit.currency,
    wallet_credited: true,
    deposit_status: deposit.status,
    already_fulfilled: true,
  };
}

/** Server-side Paystack verify + shared idempotent settlement (same path as webhook). */
export async function verifyWalletDepositWithPaystack(
  service: SupabaseClient,
  paystack: PaystackClient,
  authenticatedUserId: string,
  paymentReference: string,
): Promise<VerifyWalletDepositResult> {
  const deposit = await findDepositByPaymentReference(service, paymentReference);

  if (!deposit) {
    throw new DepositSettlementError('Unknown deposit reference', 'unknown_deposit');
  }

  if (deposit.user_id !== authenticatedUserId) {
    throw new Error('Forbidden');
  }

  if (deposit.status === 'completed') {
    return resultFromCompletedDeposit(deposit);
  }

  const verified = await paystack.verifyTransaction(deposit.reference);

  if (verified.status !== 'success') {
    if (deposit.status === 'pending') {
      await markDepositFailed(service, deposit.reference);
    }

    return {
      status: verified.status,
      reference: verified.reference,
      amount_kobo: verified.amount,
      currency: verified.currency,
      wallet_credited: false,
      deposit_status: 'failed',
    };
  }

  try {
    const settlement = settlementFromPaystackVerify(deposit, verified);
    const outcome = await settleDepositFromPaystack(service, deposit.reference, settlement);

    return {
      status: verified.status,
      reference: verified.reference,
      amount_kobo: verified.amount,
      currency: verified.currency,
      paid_at: verified.paid_at,
      channel: verified.channel,
      wallet_credited: outcome.walletCredited,
      deposit_status: outcome.status,
      already_fulfilled: outcome.alreadyFulfilled,
    };
  } catch (error) {
    if (error instanceof DepositSettlementError) {
      return {
        status: verified.status,
        reference: verified.reference,
        amount_kobo: verified.amount,
        currency: verified.currency,
        paid_at: verified.paid_at,
        channel: verified.channel,
        wallet_credited: false,
        deposit_status: deposit.status,
        fulfillment_rejected: true,
        rejection_reason: error.code,
      };
    }
    throw error;
  }
}
