import { clearPendingDepositContext } from '@/features/wallet/deposit-api';

export const WALLET_RETURN_TO_PARAM = 'returnTo';

export function readWalletReturnTo(param: string | string[] | undefined): string | undefined {
  const value = Array.isArray(param) ? param[0] : param;
  if (!value || !value.startsWith('/')) return undefined;
  return value;
}

export function clearWalletDepositNavigationState(): void {
  clearPendingDepositContext();
}

type DepositFlowRouter = {
  replace: (href: string) => void;
};

/** Lands on wallet home without leaving add/review/checkout in the history stack. */
export function exitWalletDepositToHome(router: DepositFlowRouter): void {
  clearWalletDepositNavigationState();
  router.replace('/wallet');
}

/** Back out of deposit mid-flow; returns to `returnTo` when set, otherwise wallet home. */
export function exitWalletDepositLeaving(router: DepositFlowRouter, returnTo?: string): void {
  if (returnTo) {
    clearWalletDepositNavigationState();
    router.replace(returnTo);
    return;
  }
  exitWalletDepositToHome(router);
}

/** Leaves the deposit flow after success (same as leaving, without stacking deposit screens). */
export function exitWalletDepositAfterSuccess(router: DepositFlowRouter, returnTo?: string): void {
  exitWalletDepositLeaving(router, returnTo);
}