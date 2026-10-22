/** Client-safe withdrawal admin constants and types (no server imports). */

export const WITHDRAWAL_STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'failed', label: 'Failed' },
] as const;

export type WithdrawalListItem = {
  id: string;
  reference: string;
  user_id: string;
  user_name: string | null;
  amount: number;
  status: string;
  destination_bank_name: string;
  destination_account_number_masked: string;
  destination_account_name: string;
  wallet_transaction_id: string;
  created_at: string;
  updated_at: string;
};

export type WithdrawalsOverview = {
  metrics: {
    pending_count: number;
    processing_count: number;
    completed_today_count: number;
    outstanding_total_kobo: number;
  };
  definitions: Record<string, string>;
};
