import { MARKET, WALLET } from '@/config';
import { formatMoney } from '@/lib/format';

import type { PublicWithdrawalPolicy } from './withdraw-policy-api';

export type WithdrawAmountLimits = {
  minMajor: number;
  maxMajor: number;
};

export function resolveWithdrawAmountLimits(
  policy: PublicWithdrawalPolicy | undefined,
): WithdrawAmountLimits {
  if (!policy) {
    return {
      minMajor: WALLET.withdrawMinMajor,
      maxMajor: WALLET.withdrawMaxMajor,
    };
  }
  return {
    minMajor: policy.minAmountMajor,
    maxMajor: policy.maxAmountMajor,
  };
}

export function validateWithdrawAmountMajor(
  amountMajor: number,
  availableMajor: number,
  limits: WithdrawAmountLimits = resolveWithdrawAmountLimits(undefined),
): string | null {
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    return null;
  }

  if (!Number.isInteger(amountMajor)) {
    return 'Enter a whole-naira amount.';
  }

  if (amountMajor < limits.minMajor) {
    return `Minimum withdrawal is ${formatMoney(limits.minMajor, MARKET.currency)}.`;
  }

  if (amountMajor > limits.maxMajor) {
    return `Maximum withdrawal is ${formatMoney(limits.maxMajor, MARKET.currency)}.`;
  }

  if (amountMajor > availableMajor) {
    return 'Amount exceeds your available balance.';
  }

  return null;
}
