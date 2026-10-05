import { WALLET } from '@/config';

export function validateDepositAmountMajor(amount: number): string | null {
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    return 'Enter a whole naira amount';
  }
  if (amount < WALLET.depositMinMajor) {
    return `Minimum deposit is ₦${WALLET.depositMinMajor.toLocaleString()}`;
  }
  if (amount > WALLET.depositMaxMajor) {
    return `Maximum deposit is ₦${WALLET.depositMaxMajor.toLocaleString()}`;
  }
  return null;
}
