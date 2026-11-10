import { MARKET, WALLET } from '@/config/index';
import { resolveAgreedAmount } from '@/features/requests/payment-display';
import { formatMoney } from '@/lib/format';
import { WALLET_RETURN_TO_PARAM, readWalletReturnTo } from '@/features/wallet/deposit-navigation';

export const WALLET_TOP_UP_PREFILL_PARAM = 'prefillAmount';
export const WALLET_TOP_UP_SHORTFALL_PARAM = 'topUpShortfall';

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

export function suggestedWalletTopUpMajor(shortfallMajor: number): number | undefined {
  const shortfall = Math.trunc(shortfallMajor);
  if (shortfall <= 0) return undefined;
  const suggested = Math.max(shortfall, WALLET.depositMinMajor);
  if (suggested > WALLET.depositMaxMajor) return WALLET.depositMaxMajor;
  return suggested;
}

export function readWalletTopUpPrefill(param: string | string[] | undefined): string | undefined {
  const value = Array.isArray(param) ? param[0] : param;
  if (!value || !/^\d+$/.test(value)) return undefined;
  const major = Number(value);
  if (!Number.isFinite(major) || major <= 0) return undefined;
  return String(Math.trunc(major));
}

export function readWalletTopUpShortfall(param: string | string[] | undefined): number | undefined {
  const value = Array.isArray(param) ? param[0] : param;
  if (!value || !/^\d+$/.test(value)) return undefined;
  const major = Number(value);
  if (!Number.isFinite(major) || major <= 0) return undefined;
  return Math.trunc(major);
}

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

export type WalletTopUpContext = {
  returnTo: string;
  requiredLockMajor: number;
  availableMajor: number;
};

function buildTopUpSearch(context: WalletTopUpContext): string {
  const returnTo = context.returnTo;
  if (!returnTo.startsWith('/')) {
    throw new Error('returnTo must be an app path.');
  }
  const shortfall = walletLockShortfallMajor(context.requiredLockMajor, context.availableMajor);
  const prefill = suggestedWalletTopUpMajor(shortfall);
  const params = walletDepositFlowParams({
    returnTo,
    prefillAmountMajor: prefill,
    shortfallMajor: shortfall > 0 ? shortfall : undefined,
  });
  const qs = new URLSearchParams(params).toString();
  return qs ? `?${qs}` : '';
}

export function walletTopUpPath(context: WalletTopUpContext): string {
  return `/wallet/add${buildTopUpSearch(context)}`;
}

export function walletTopUpAddSubtitle(shortfallMajor: number): string | null {
  if (shortfallMajor <= 0) return null;
  return `Add at least ${formatMoney(shortfallMajor, MARKET.currency)} so you have enough available to continue.`;
}
