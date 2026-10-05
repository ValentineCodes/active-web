import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { MARKET, WALLET } from '@/config';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type MyWallet = {
  available: number;
  locked: number;
  pending: number;
  currency: string;
  updated_at: string;
};

export function useMyWallet() {
  return useQuery({
    queryKey: queryKeys.wallet,
    queryFn: async (): Promise<MyWallet> => {
      const { data, error } = await supabase.from('my_wallet').select('*').maybeSingle();

      if (error) throw error;

      return {
        available: data?.available ?? 0,
        locked: data?.locked ?? 0,
        pending: data?.pending ?? 0,
        currency: data?.currency ?? MARKET.currency,
        updated_at: data?.updated_at ?? new Date(0).toISOString(),
      };
    },
  });
}

export function useWalletActivity() {
  return useQuery({
    queryKey: queryKeys.walletActivity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('my_wallet_activity')
        .select('id, kind, available_delta, locked_delta, pending_delta, request_id, created_at')
        .order('created_at', { ascending: false })
        .limit(WALLET.activityLimit);

      if (error) throw error;
      return data ?? [];
    },
  });
}

async function invalidateWalletQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: queryKeys.wallet });
  await queryClient.invalidateQueries({ queryKey: queryKeys.walletActivity });
}

export function useWalletTopUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (amount: number) => {
      const { error } = await supabase.rpc('wallet_top_up', {
        p_amount: amount,
        p_idempotency_key: newIdempotencyKey('top-up'),
      });
      if (error) throw error;
    },
    onSuccess: () => void invalidateWalletQueries(queryClient),
  });
}

export function useWalletWithdraw() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (amount: number) => {
      const { error } = await supabase.rpc('wallet_withdraw', {
        p_amount: amount,
        p_idempotency_key: newIdempotencyKey('withdraw'),
      });
      if (error) throw error;
    },
    onSuccess: () => void invalidateWalletQueries(queryClient),
  });
}
