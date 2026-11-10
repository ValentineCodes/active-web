'use client';

import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/use-session';
import { WALLET } from '@/config/index';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

import { koboToMajor } from './kobo';
import {
  walletActivityIsVisibleInFeed,
  walletTransactionDisplayKind,
  type WalletActivityRow,
} from './activity';
import type { MyWallet, WalletBalanceKobo, WalletTransactionRow } from './types';

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

const EMPTY_WALLET: MyWallet = {
  available: 0,
  locked: 0,
  pending: 0,
  currency: 'NGN',
  updated_at: new Date(0).toISOString(),
};

function majorFromView(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
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

type WalletActivityPage = {
  items: WalletActivityRow[];
  nextOffset: number;
  hasMore: boolean;
};

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

/** Read-only wallet snapshot (PostgREST-safe; avoids get_my_wallet INSERT side effects). */
export async function fetchMyWallet(): Promise<MyWallet> {
  const { data, error } = await supabase
    .from('my_wallet')
    .select('available, locked, pending, currency, updated_at')
    .maybeSingle();
  if (error) throw error;

  if (!data) return EMPTY_WALLET;

  return {
    available: majorFromView(data.available),
    locked: majorFromView(data.locked),
    pending: majorFromView(data.pending),
    currency: data.currency ?? 'NGN',
    updated_at: data.updated_at ?? EMPTY_WALLET.updated_at,
  };
}

export async function fetchMyWalletBalance(): Promise<WalletBalanceKobo> {
  const wallet = await fetchMyWallet();
  return {
    walletId: '',
    availableKobo: Math.round(wallet.available * 100),
    lockedKobo: Math.round(wallet.locked * 100),
    pendingKobo: Math.round(wallet.pending * 100),
    currency: 'NGN',
    updatedAt: wallet.updated_at,
  };
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

/** Loads feed rows, advancing raw offsets past hidden ledger entries (e.g. escrow_pending). */
async function fetchVisibleWalletActivity(
  targetCount: number,
  startOffset = 0,
): Promise<WalletActivityPage> {
  const items: WalletActivityRow[] = [];
  let offset = startOffset;
  let hasMore = true;

  while (items.length < targetCount && hasMore) {
    const raw = await fetchMyWalletTransactions(WALLET.historyPageSize, offset);
    if (raw.length === 0) {
      hasMore = false;
      break;
    }
    for (const row of raw) {
      const item = transactionToActivityItem(row);
      if (walletActivityIsVisibleInFeed(item)) items.push(item);
    }
    offset += raw.length;
    hasMore = raw.length === WALLET.historyPageSize;
  }

  return { items, nextOffset: offset, hasMore };
}

export function useMyWallet() {
  const { session } = useSession();
  return useQuery({
    queryKey: queryKeys.wallet,
    enabled: Boolean(session),
    networkMode: 'always',
    queryFn: fetchMyWallet,
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
      const page = await fetchVisibleWalletActivity(WALLET.activityLimit);
      return page.items;
    },
  });
}

export function useWalletActivityInfinite() {
  const { session } = useSession();
  return useInfiniteQuery({
    queryKey: [...queryKeys.walletActivity, 'pages'],
    enabled: Boolean(session),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => fetchVisibleWalletActivity(WALLET.historyPageSize, pageParam),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
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
  await queryClient.invalidateQueries({ queryKey: queryKeys.walletWithdrawals });
  await queryClient.invalidateQueries({ queryKey: queryKeys.notificationInbox });
  await queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnreadCount });
}
