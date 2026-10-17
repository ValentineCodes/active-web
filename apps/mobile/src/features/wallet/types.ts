import type { Database } from '@/lib/supabase/database.types';

export type WalletTransactionType = Database['public']['Enums']['wallet_transaction_type'];
export type WalletTransactionStatus = Database['public']['Enums']['wallet_transaction_status'];
export type DepositTransactionStatus = Database['public']['Enums']['deposit_transaction_status'];
export type PaymentLockBucket = Database['public']['Enums']['payment_lock_bucket'];
export type PaymentLockStatus = Database['public']['Enums']['payment_lock_status'];

/** Server wallet snapshot (amounts in kobo). */
export type WalletBalanceKobo = {
  walletId: string;
  availableKobo: number;
  lockedKobo: number;
  pendingKobo: number;
  currency: 'NGN';
  updatedAt: string;
};

/** Wallet transaction row from the server. */
export type WalletTransactionRow = {
  id: string;
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  amountKobo: number;
  reference: string;
  requestId: string | null;
  paystackReference: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  availableDeltaKobo: number;
  lockedDeltaKobo: number;
  createdAt: string;
};

/** UI-facing wallet totals (major NGN units) derived from kobo on the client. */
export type MyWallet = {
  available: number;
  locked: number;
  pending: number;
  currency: string;
  updated_at: string;
};
