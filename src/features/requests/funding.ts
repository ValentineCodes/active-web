import { MARKET, SERVICE_FEE_RATE } from '@/config';

export type RequestFundingSummary = {
  providerAmount: number;
  serviceFee: number;
  total: number;
  currency: string;
};

/** What the requester pays and how it splits before the request is submitted.
 *  Server-side public.compute_request_charge uses the same fee rule at escrow lock. */
export function summarizeRequestFunding(offeredAmount: number): RequestFundingSummary {
  const providerAmount = offeredAmount;
  const serviceFee = Math.round(offeredAmount * SERVICE_FEE_RATE);
  return {
    providerAmount,
    serviceFee,
    total: providerAmount + serviceFee,
    currency: MARKET.currency,
  };
}

export function isFundedOffer(amount: number | null): amount is number {
  return amount !== null && !Number.isNaN(amount) && amount > 0;
}
