import type { Database } from '@/lib/supabase/database.types';

export type WalletActivityRow = Database['public']['Views']['my_wallet_activity']['Row'];

const KIND_LABELS: Record<string, string> = {
  external_deposit: 'Deposit',
  manual_top_up: 'Top up',
  manual_withdraw: 'Withdraw',
  escrow_lock: 'Request funded',
  escrow_top_up: 'Offer increased',
  escrow_partial_refund: 'Offer reduced',
  escrow_pending: 'Offer committed',
  escrow_relock: 'Offer secured again',
  escrow_release: 'Payment sent',
  pay_provider: 'Payment received',
  refund: 'Refund',
};

export function walletActivityTitle(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replaceAll('_', ' ');
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

export function walletActivitySignedLabel(amount: number): string {
  if (amount > 0) return `+${amount}`;
  return `${amount}`;
}
