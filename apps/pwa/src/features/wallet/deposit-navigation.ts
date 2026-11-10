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
