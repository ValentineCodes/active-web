import type { PaymentStatus, RequestStatus } from '@/features/domain/model';
import { formatMoney } from '@/lib/format';

/** Agreed payout to the helper (counter offer or original offer). */
export function resolveAgreedProviderAmount(input: {
  agreedProviderAmount?: number | null;
  quotedAmount?: number | null;
  offeredAmount?: number | null;
}): number | null {
  if (input.agreedProviderAmount != null && input.agreedProviderAmount > 0) {
    return input.agreedProviderAmount;
  }

  if (input.quotedAmount != null && input.quotedAmount > 0) {
    return input.quotedAmount;
  }

  if (input.offeredAmount != null && input.offeredAmount > 0) {
    return input.offeredAmount;
  }

  return null;
}

export type RequestMoneyDisplay = {
  label: 'Offer' | 'Paid';
  amount: string;
  hint: string | null;
};

/** Simple requester/helper money copy — no escrow or ledger terminology. */
export function requestMoneyDisplay(input: {
  requestStatus: RequestStatus;
  paymentStatus: PaymentStatus | null;
  offeredAmount: number | null;
  agreedProviderAmount?: number | null;
  quotedAmount?: number | null;
  currency: string;
  viewerIsRequester: boolean;
}): RequestMoneyDisplay | null {
  const agreed = resolveAgreedProviderAmount({
    agreedProviderAmount: input.agreedProviderAmount,
    quotedAmount: input.quotedAmount,
    offeredAmount: input.offeredAmount,
  });

  const offerAmount = input.offeredAmount ?? agreed;
  if (offerAmount == null || offerAmount <= 0) {
    return null;
  }

  const paidOut = input.requestStatus === 'completed' || input.paymentStatus === 'released';

  if (paidOut && agreed != null) {
    return {
      label: 'Paid',
      amount: formatMoney(agreed, input.currency),
      hint: input.viewerIsRequester ? 'Sent to the person who helped.' : 'Received in your wallet.',
    };
  }

  const selected =
    input.requestStatus !== 'posted' &&
    input.requestStatus !== 'searching' &&
    input.requestStatus !== 'expired' &&
    input.requestStatus !== 'cancelled' &&
    input.requestStatus !== 'draft';

  const displayAmount = input.viewerIsRequester
    ? selected
      ? (agreed ?? offerAmount)
      : offerAmount
    : (agreed ?? offerAmount);

  let hint: string | null = null;
  if (input.viewerIsRequester) {
    if (input.paymentStatus === 'refunded') {
      hint = 'Returned to your available wallet balance.';
    } else if (input.paymentStatus === 'locked' || input.paymentStatus === 'pending') {
      hint = 'Held from your wallet until this request is finished or cancelled.';
    }
  }

  return {
    label: 'Offer',
    amount: formatMoney(displayAmount, input.currency),
    hint,
  };
}
