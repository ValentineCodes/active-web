import type { WalletWithdrawalStatus } from './withdrawals-api';

export function walletWithdrawalStatusLabel(status: WalletWithdrawalStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'processing':
      return 'Processing';
    case 'completed':
      return 'Completed';
    case 'rejected':
      return 'Rejected';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

export function walletWithdrawalStatusDescription(status: WalletWithdrawalStatus): string {
  switch (status) {
    case 'pending':
      return 'Awaiting review. Your money is reserved until we approve or decline this request.';
    case 'processing':
      return 'Approved and being sent to your bank manually. This can take some time.';
    case 'completed':
      return 'Transfer confirmed. The amount has left your Active wallet.';
    case 'rejected':
      return 'Declined. Reserved funds were returned to your available balance.';
    case 'failed':
      return 'Transfer did not succeed. Reserved funds were returned to your available balance.';
    default:
      return '';
  }
}

export function walletWithdrawalStatusTone(
  status: WalletWithdrawalStatus,
): 'muted' | 'warning' | 'active' | 'danger' {
  switch (status) {
    case 'pending':
    case 'processing':
      return 'warning';
    case 'completed':
      return 'active';
    case 'rejected':
    case 'failed':
      return 'danger';
    default:
      return 'muted';
  }
}
