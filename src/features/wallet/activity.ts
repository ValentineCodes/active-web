import type { WalletTransactionStatus, WalletTransactionType } from './types';

export type WalletActivityRow = {
  id: string;
  kind: string;
  available_delta: number;
  locked_delta: number;
  pending_delta: number;
  request_id: string | null;
  created_at: string;
  status: WalletTransactionStatus;
  description: string | null;
};

const KIND_LABELS: Record<string, string> = {
  external_deposit: 'Money added',
  manual_top_up: 'Money added',
  deposit: 'Money added',
  manual_withdraw: 'Withdrawal',
  withdrawal: 'Withdrawal',
  escrow_lock: 'Request funded',
  escrow_top_up: 'Request funded',
  escrow_partial_refund: 'Funds returned',
  escrow_pending: 'Request funded',
  escrow_relock: 'Request funded',
  escrow_release: 'Payment released',
  pay_provider: 'Payment received',
  payout: 'Payment received',
  refund: 'Refund',
  service_fee: 'Service fee',
  adjustment: 'Balance update',
};

export function walletTransactionDisplayKind(input: {
  type: WalletTransactionType;
  metadata: Record<string, unknown>;
}): string {
  const legacy = input.metadata.legacy_kind;
  if (typeof legacy === 'string' && legacy.trim()) {
    return legacy.trim();
  }

  switch (input.type) {
    case 'deposit':
      return 'external_deposit';
    case 'withdrawal':
      return 'manual_withdraw';
    case 'payout':
      return 'pay_provider';
    default:
      return input.type;
  }
}

export function walletActivityTitle(kind: string): string {
  return KIND_LABELS[kind] ?? 'Balance update';
}

export function walletTransactionStatusLabel(status: WalletTransactionStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'failed':
      return 'Failed';
    case 'reversed':
      return 'Reversed';
    default:
      return 'Completed';
  }
}

/** Primary amount shown in the activity list (always a user-visible money movement when non-zero). */
export function walletActivityAmount(row: WalletActivityRow): number | null {
  if (row.available_delta !== null && row.available_delta !== 0) {
    return row.available_delta;
  }
  if (row.locked_delta !== null && row.locked_delta !== 0) {
    return row.locked_delta;
  }
  if (row.pending_delta !== null && row.pending_delta !== 0) {
    return row.pending_delta;
  }
  return null;
}
