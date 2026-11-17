import type { WalletActivityRow } from '@/features/wallet/activity';

export function walletActivityHref(row: WalletActivityRow): string | undefined {
  if (row.withdrawal?.withdrawalId) {
    return `/wallet/withdrawal/${row.withdrawal.withdrawalId}`;
  }
  if (row.id) {
    return `/wallet/transaction/${row.id}`;
  }
  return undefined;
}