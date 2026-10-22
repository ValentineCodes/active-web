import { useQuery } from '@tanstack/react-query';

import { koboToMajor } from '@/features/wallet/kobo';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

import type { PendingWithdrawSubmission } from './withdraw-pending';

export type WalletWithdrawalStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'rejected'
  | 'failed';

export type MyWalletWithdrawal = {
  withdrawalId: string;
  amountKobo: number;
  amountMajor: number;
  currency: string;
  status: WalletWithdrawalStatus;
  destinationBankName: string;
  destinationAccountNumberMasked: string;
  destinationAccountName: string;
  userFacingReason: string | null;
  walletTransactionId: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  rejectedAt: string | null;
  failedAt: string | null;
  processingAt: string | null;
};

type ListWithdrawalRow = {
  withdrawal_id: string;
  amount_kobo: number;
  currency: string;
  status: string;
  destination_bank_name: string;
  destination_account_number_masked: string;
  destination_account_name: string;
  user_facing_reason: string | null;
  wallet_transaction_id: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type WithdrawalDetailJson = {
  withdrawal_id: string;
  amount_kobo: number;
  currency: string;
  status: string;
  destination_bank_name: string;
  destination_bank_code: string;
  destination_account_number_masked: string;
  destination_account_name: string;
  user_facing_reason: string | null;
  wallet_transaction_id: string;
  release_transaction_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  rejected_at: string | null;
  failed_at: string | null;
  processing_at: string | null;
};

function mapListRow(row: ListWithdrawalRow): MyWalletWithdrawal {
  return {
    withdrawalId: row.withdrawal_id,
    amountKobo: row.amount_kobo,
    amountMajor: koboToMajor(row.amount_kobo),
    currency: row.currency,
    status: row.status as WalletWithdrawalStatus,
    destinationBankName: row.destination_bank_name,
    destinationAccountNumberMasked: row.destination_account_number_masked,
    destinationAccountName: row.destination_account_name,
    userFacingReason: row.user_facing_reason,
    walletTransactionId: row.wallet_transaction_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    rejectedAt: null,
    failedAt: null,
    processingAt: null,
  };
}

function mapDetail(body: WithdrawalDetailJson): MyWalletWithdrawal {
  return {
    withdrawalId: body.withdrawal_id,
    amountKobo: body.amount_kobo,
    amountMajor: koboToMajor(body.amount_kobo),
    currency: body.currency,
    status: body.status as WalletWithdrawalStatus,
    destinationBankName: body.destination_bank_name,
    destinationAccountNumberMasked: body.destination_account_number_masked,
    destinationAccountName: body.destination_account_name,
    userFacingReason: body.user_facing_reason,
    walletTransactionId: body.wallet_transaction_id,
    createdAt: body.created_at,
    updatedAt: body.updated_at,
    completedAt: body.completed_at,
    rejectedAt: body.rejected_at,
    failedAt: body.failed_at,
    processingAt: body.processing_at,
  };
}

export async function fetchMyWalletWithdrawals(
  limit = 50,
  offset = 0,
): Promise<MyWalletWithdrawal[]> {
  const { data, error } = await supabase.rpc('list_my_wallet_withdrawals', {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return ((data ?? []) as ListWithdrawalRow[]).map(mapListRow);
}

export async function fetchMyWalletWithdrawal(withdrawalId: string): Promise<MyWalletWithdrawal> {
  const { data, error } = await supabase.rpc('get_my_wallet_withdrawal', {
    p_withdrawal_id: withdrawalId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object') {
    throw new Error('Withdrawal not found');
  }
  return mapDetail(data as WithdrawalDetailJson);
}

export async function resolveWithdrawalAfterNetworkError(
  context: PendingWithdrawSubmission,
  bankName: string,
  accountName: string,
): Promise<MyWalletWithdrawal | null> {
  const rows = await fetchMyWalletWithdrawals(30, 0);
  const amountKobo = Math.round(context.amountMajor * 100);
  const started = new Date(context.startedAt).getTime();

  const match = rows.find((row) => {
    if (row.amountKobo !== amountKobo) return false;
    if (row.destinationBankName !== bankName) return false;
    if (row.destinationAccountName !== accountName) return false;
    if (row.status !== 'pending' && row.status !== 'processing' && row.status !== 'completed') {
      return false;
    }
    const created = new Date(row.createdAt).getTime();
    return created >= started - 60_000;
  });

  return match ?? null;
}

export function useMyWalletWithdrawals() {
  return useQuery({
    queryKey: queryKeys.walletWithdrawals,
    queryFn: () => fetchMyWalletWithdrawals(50, 0),
  });
}

export function useMyWalletWithdrawal(withdrawalId: string) {
  return useQuery({
    queryKey: [...queryKeys.walletWithdrawals, withdrawalId],
    enabled: Boolean(withdrawalId),
    queryFn: () => fetchMyWalletWithdrawal(withdrawalId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'pending' || status === 'processing') return 15_000;
      return false;
    },
  });
}

export function withdrawalsByLedgerTransactionId(
  rows: MyWalletWithdrawal[],
): Map<string, MyWalletWithdrawal> {
  const map = new Map<string, MyWalletWithdrawal>();
  for (const row of rows) {
    map.set(row.walletTransactionId, row);
  }
  return map;
}

export function enrichActivityWithWithdrawals<T extends { id: string; kind: string }>(
  items: T[],
  withdrawals: MyWalletWithdrawal[],
): (T & { withdrawal?: import('./activity').WalletActivityWithdrawalMeta })[] {
  const byLedger = withdrawalsByLedgerTransactionId(withdrawals);
  return items.map((item) => {
    if (item.kind !== 'manual_withdraw') return item;
    const w = byLedger.get(item.id);
    if (!w) return item;
    return {
      ...item,
      withdrawal: {
        withdrawalId: w.withdrawalId,
        queueStatus: w.status,
        destinationBankName: w.destinationBankName,
        destinationAccountNumberMasked: w.destinationAccountNumberMasked,
        destinationAccountName: w.destinationAccountName,
        userFacingReason: w.userFacingReason,
        completedAt: w.completedAt,
      },
    };
  });
}
