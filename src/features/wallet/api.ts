import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session';
import { WALLET } from '@/config';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

import { koboToMajor, parseKobo } from './kobo';
import { walletTransactionDisplayKind, type WalletActivityRow } from './activity';
import type { MyWallet, WalletBalanceKobo, WalletTransactionRow } from './types';

type GetMyWalletRow = {
  wallet_id: string;
  available_kobo: number;
  locked_kobo: number;
  pending_kobo: number;
  currency: string;
  updated_at: string;
};

type ListWalletTransactionRow = {
  id: string;
  type: WalletTransactionRow['type'];
  status: WalletTransactionRow['status'];
  amount: number;
  reference: string;
  request_id: string | null;
  paystack_reference: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  available_delta_kobo: number;
  locked_delta_kobo: number;
  created_at: string;
};

export type { MyWallet, WalletBalanceKobo, WalletTransactionRow } from './types';
export type { WalletActivityRow as WalletActivityListItem } from './activity';

function mapWalletBalance(row: GetMyWalletRow): WalletBalanceKobo {
  return {
    walletId: row.wallet_id,
    availableKobo: parseKobo(row.available_kobo),
    lockedKobo: parseKobo(row.locked_kobo),
    pendingKobo: parseKobo(row.pending_kobo),
    currency: 'NGN',
    updatedAt: row.updated_at,
  };
}

function balanceToMyWallet(balance: WalletBalanceKobo): MyWallet {
  return {
    available: koboToMajor(balance.availableKobo),
    locked: koboToMajor(balance.lockedKobo),
    pending: koboToMajor(balance.pendingKobo),
    currency: balance.currency,
    updated_at: balance.updatedAt,
  };
}

function mapTransaction(row: ListWalletTransactionRow): WalletTransactionRow {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    amountKobo: row.amount,
    reference: row.reference,
    requestId: row.request_id,
    paystackReference: row.paystack_reference,
    description: row.description,
    metadata: row.metadata ?? {},
    availableDeltaKobo: row.available_delta_kobo,
    lockedDeltaKobo: row.locked_delta_kobo,
    createdAt: row.created_at,
  };
}

function transactionToActivityItem(row: WalletTransactionRow): WalletActivityRow {
  const kind = walletTransactionDisplayKind(row);
  const pendingKobo =
    typeof row.metadata.pending_delta_kobo === 'number' ? row.metadata.pending_delta_kobo : 0;

  return {
    id: row.id,
    kind,
    available_delta: koboToMajor(row.availableDeltaKobo),
    locked_delta: koboToMajor(row.lockedDeltaKobo),
    pending_delta: koboToMajor(pendingKobo),
    request_id: row.requestId,
    created_at: row.createdAt,
    status: row.status,
    description: row.description,
  };
}

export async function fetchMyWalletBalance(): Promise<WalletBalanceKobo> {
  const { data, error } = await supabase.rpc('get_my_wallet').maybeSingle();
  if (error) throw error;

  if (!data) {
    return {
      walletId: '',
      availableKobo: 0,
      lockedKobo: 0,
      pendingKobo: 0,
      currency: 'NGN',
      updatedAt: new Date(0).toISOString(),
    };
  }

  return mapWalletBalance(data as GetMyWalletRow);
}

export async function fetchMyWalletTransactions(
  limit: number = WALLET.activityLimit,
  offset: number = 0,
): Promise<WalletTransactionRow[]> {
  const { data, error } = await supabase.rpc('list_my_wallet_transactions', {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return ((data ?? []) as ListWalletTransactionRow[]).map(mapTransaction);
}

export function useMyWallet() {
  const { session } = useSession();
  return useQuery({
    queryKey: queryKeys.wallet,
    enabled: Boolean(session),
    queryFn: async (): Promise<MyWallet> => {
      const balance = await fetchMyWalletBalance();
      return balanceToMyWallet(balance);
    },
  });
}

export function useWalletBalanceKobo() {
  const { session } = useSession();
  return useQuery({
    queryKey: [...queryKeys.wallet, 'kobo'],
    enabled: Boolean(session),
    queryFn: fetchMyWalletBalance,
  });
}

export function useWalletActivity() {
  const { session } = useSession();
  return useQuery({
    queryKey: queryKeys.walletActivity,
    enabled: Boolean(session),
    queryFn: async (): Promise<WalletActivityRow[]> => {
      const rows = await fetchMyWalletTransactions(WALLET.activityLimit);
      return rows.map(transactionToActivityItem);
    },
  });
}

export function useWalletActivityInfinite() {
  const { session } = useSession();
  return useInfiniteQuery({
    queryKey: [...queryKeys.walletActivity, 'pages'],
    enabled: Boolean(session),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const rows = await fetchMyWalletTransactions(WALLET.historyPageSize, pageParam);
      return rows.map(transactionToActivityItem);
    },
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (lastPage.length < WALLET.historyPageSize) return undefined;
      return lastPageParam + WALLET.historyPageSize;
    },
  });
}

export function useWalletTransactions() {
  const { session } = useSession();
  return useQuery({
    queryKey: [...queryKeys.walletActivity, 'raw'],
    enabled: Boolean(session),
    queryFn: () => fetchMyWalletTransactions(WALLET.activityLimit),
  });
}

export async function invalidateWalletQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
  await queryClient.invalidateQueries({ queryKey: queryKeys.walletActivity });
}
