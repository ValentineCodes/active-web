import type { Database } from '@/lib/supabase/database.types';

export type WalletActivityRow = Database['public']['Views']['my_wallet_activity']['Row'];

const KIND_LABELS: Record<string, string> = {
  external_deposit: 'Money added',
  manual_top_up: 'Money added',
  manual_withdraw: 'Withdrawal',
  escrow_lock: 'Request funded',
  escrow_top_up: 'Offer increased',
  escrow_partial_refund: 'Funds returned',
  escrow_pending: 'Request funded',
  escrow_relock: 'Request funded',
  escrow_release: 'Service payment',
  pay_provider: 'Payment received',
  refund: 'Funds returned',
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
