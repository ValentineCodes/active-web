import { type Href, router } from 'expo-router';

import { clearPendingDepositContext } from '@/features/wallet/deposit-api';

/** add → review → checkout (browser + confirmation on one screen). */
const WALLET_DEPOSIT_STACK_DEPTH = 3;

export const WALLET_RETURN_TO_PARAM = 'returnTo';

export function readWalletReturnTo(param: string | string[] | undefined): string | undefined {
  const value = Array.isArray(param) ? param[0] : param;
  if (!value || !value.startsWith('/')) return undefined;
  return value;
}

/** Lands on wallet home without leaving processing/review/add in the back stack. */
export function exitWalletDepositToHome(): void {
  clearPendingDepositContext();
  if (router.canDismiss()) {
    router.dismiss(WALLET_DEPOSIT_STACK_DEPTH);
  }
  router.replace('/wallet');
}

function exitWalletDepositToReturnTo(returnTo: string): void {
  clearPendingDepositContext();
  router.dismissTo(returnTo as Href);
}

/** Back out of deposit mid-flow; returns to `returnTo` when set, otherwise wallet home. */
export function exitWalletDepositLeaving(returnTo?: string): void {
  if (returnTo) {
    exitWalletDepositToReturnTo(returnTo);
    return;
  }
  exitWalletDepositToHome();
}

/** Leaves the deposit flow after success; with `returnTo`, pops back to that screen in the stack. */
export function exitWalletDepositAfterSuccess(returnTo?: string): void {
  if (returnTo) {
    exitWalletDepositToReturnTo(returnTo);
    return;
  }
  exitWalletDepositToHome();
}
