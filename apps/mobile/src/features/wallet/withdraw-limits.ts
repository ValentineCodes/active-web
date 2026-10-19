import { MARKET, WALLET } from '@/config';
import { formatMoney } from '@/lib/format';

export function validateWithdrawAmountMajor(
  amountMajor: number,
  availableMajor: number,
): string | null {
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    return 'Enter an amount to withdraw.';
  }

  if (!Number.isInteger(amountMajor)) {
    return 'Enter a whole-naira amount.';
  }

  if (amountMajor < WALLET.withdrawMinMajor) {
    return `Minimum withdrawal is ${formatMoney(WALLET.withdrawMinMajor, MARKET.currency)}.`;
  }

  if (amountMajor > WALLET.withdrawMaxMajor) {
    return `Maximum withdrawal is ${formatMoney(WALLET.withdrawMaxMajor, MARKET.currency)}.`;
  }

  if (amountMajor > availableMajor) {
    return 'Amount exceeds your available balance.';
  }

  return null;
}
