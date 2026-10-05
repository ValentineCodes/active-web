import { MARKET, SERVICE_FEE_RATE } from '@/config';

export type RequestFundingSummary = {
  /** Whole naira the requester offers (and locks from wallet). */
  offerAmount: number;
  /** Platform fee taken from the offer when paying the helper. */
  serviceFee: number;
  /** Whole naira the helper receives after the fee. */
  providerReceives: number;
  /** Same as offerAmount — held from the requester's available balance. */
  total: number;
  currency: string;
};

/** Matches server-side public.compute_request_charge (offer in → lock total = offer). */
export function summarizeRequestFunding(offeredAmount: number): RequestFundingSummary {
  const serviceFee = Math.round(offeredAmount * SERVICE_FEE_RATE);
  return {
    offerAmount: offeredAmount,
    serviceFee,
    providerReceives: offeredAmount - serviceFee,
    total: offeredAmount,
    currency: MARKET.currency,
  };
}

export function isFundedOffer(amount: number | null): amount is number {
  return amount !== null && !Number.isNaN(amount) && amount > 0;
}
