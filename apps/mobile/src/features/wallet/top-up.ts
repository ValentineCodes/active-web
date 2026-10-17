import { type Href, router } from 'expo-router';

import { MARKET, WALLET } from '@/config';
import { resolveAgreedAmount } from '@/features/requests/payment-display';
import { formatMoney } from '@/lib/format';
import {
  WALLET_RETURN_TO_PARAM,
  readWalletReturnTo,
} from '@/features/wallet/deposit-navigation';

/** Whole naira to prefill on `/wallet/add` when opening a contextual top-up. */
export const WALLET_TOP_UP_PREFILL_PARAM = 'prefillAmount';

/** Whole naira still needed (for copy on the add screen). */
export const WALLET_TOP_UP_SHORTFALL_PARAM = 'topUpShortfall';

/** Whole naira locked from the wallet when accepting a response. */
export function walletLockAmountMajor(input: {
  offeredAmount: number;
  quotedAmount?: number | null;
}): number {
  const amount = resolveAgreedAmount({
    offeredAmount: input.offeredAmount,
    quotedAmount: input.quotedAmount,
  });
  if (amount == null || amount <= 0) {
    throw new Error('A positive lock amount is required.');
  }
  return amount;
}

export type WalletTopUpContext = {
  /** Screen to return to after deposit (e.g. `/request/uuid`). */
  returnTo: Href | string;
  /** Whole naira that must be available to lock (accept, etc.). */
  requiredLockMajor: number;
  /** Requester's current available wallet balance (whole naira). */
  availableMajor: number;
};

/** Shortfall before a wallet lock can succeed. */
export function walletLockShortfallMajor(
  requiredLockMajor: number,
  availableMajor: number,
): number {
  const required = Math.trunc(requiredLockMajor);
  const available = Math.trunc(availableMajor);
  if (!Number.isFinite(required) || required <= 0) return 0;
  if (!Number.isFinite(available) || available < 0) return required;
  return Math.max(0, required - available);
}

/** Deposit amount to suggest: covers shortfall and respects wallet deposit limits. */
export function suggestedWalletTopUpMajor(shortfallMajor: number): number | undefined {
  const shortfall = Math.trunc(shortfallMajor);
  if (shortfall <= 0) return undefined;
  const suggested = Math.max(shortfall, WALLET.depositMinMajor);
  if (suggested > WALLET.depositMaxMajor) return WALLET.depositMaxMajor;
  return suggested;
}

export function readWalletTopUpPrefill(
  param: string | string[] | undefined,
): string | undefined {
  const value = Array.isArray(param) ? param[0] : param;
  if (!value || !/^\d+$/.test(value)) return undefined;
  const major = Number(value);
  if (!Number.isFinite(major) || major <= 0) return undefined;
  return String(Math.trunc(major));
}

export function readWalletTopUpShortfall(
  param: string | string[] | undefined,
): number | undefined {
  const value = Array.isArray(param) ? param[0] : param;
  if (!value || !/^\d+$/.test(value)) return undefined;
  const major = Number(value);
  if (!Number.isFinite(major) || major <= 0) return undefined;
  return Math.trunc(major);
}

/** Params to thread through add → review → checkout for a contextual top-up. */
export function walletDepositFlowParams(options: {
  returnTo?: string;
  prefillAmountMajor?: number;
  shortfallMajor?: number;
}): Record<string, string> {
  const params: Record<string, string> = {};
  const returnTo = options.returnTo ? readWalletReturnTo(options.returnTo) : undefined;
  if (returnTo) params[WALLET_RETURN_TO_PARAM] = returnTo;
  if (options.prefillAmountMajor != null && options.prefillAmountMajor > 0) {
    params[WALLET_TOP_UP_PREFILL_PARAM] = String(Math.trunc(options.prefillAmountMajor));
  }
  if (options.shortfallMajor != null && options.shortfallMajor > 0) {
    params[WALLET_TOP_UP_SHORTFALL_PARAM] = String(Math.trunc(options.shortfallMajor));
  }
  return params;
}

function buildTopUpParams(context: WalletTopUpContext): Record<string, string> {
  const returnTo =
    typeof context.returnTo === 'string' ? context.returnTo : String(context.returnTo);
  if (!returnTo.startsWith('/')) {
    throw new Error('returnTo must be an app path.');
  }
  const shortfall = walletLockShortfallMajor(
    context.requiredLockMajor,
    context.availableMajor,
  );
  const prefill = suggestedWalletTopUpMajor(shortfall);
  return walletDepositFlowParams({
    returnTo,
    prefillAmountMajor: prefill,
    shortfallMajor: shortfall > 0 ? shortfall : undefined,
  });
}

/** Opens the standard add-money flow with optional prefill and return path. */
export function openWalletTopUp(context: WalletTopUpContext): void {
  router.push({
    pathname: '/wallet/add',
    params: buildTopUpParams(context),
  });
}

export function walletTopUpAddSubtitle(shortfallMajor: number): string | null {
  if (shortfallMajor <= 0) return null;
  return `Add at least ${formatMoney(shortfallMajor, MARKET.currency)} so you have enough available to continue.`;
}
