import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useProfile } from '@/features/profile/api';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export type MyReputation = {
  crown_public: boolean;
  crown_tier: string;
  next_tier: string;
  points_main: number;
  points_to_next_tier: number;
  shield_remaining: number;
};

export function useMyReputation() {
  return useQuery({
    queryKey: queryKeys.myReputation,
    queryFn: async (): Promise<MyReputation | null> => {
      const { data, error } = await supabase.rpc('get_my_reputation');
      if (error) throw error;
      return (data?.[0] as MyReputation | undefined) ?? null;
    },
  });
}

export type ReputationLedgerRow = {
  ledger_id: string;
  delta_main: number;
  delta_shield: number;
  reason: string;
  source: string;
  created_at: string;
};

export function useMyReputationHistory() {
  return useQuery({
    queryKey: queryKeys.myReputationHistory,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_my_reputation_history', {
        p_limit: 50,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as ReputationLedgerRow[];
    },
  });
}

export function useSetCrownPublic() {
  const queryClient = useQueryClient();
  const profile = useProfile();

  return useMutation({
    mutationFn: async (visible: boolean) => {
      const { error } = await supabase.rpc('set_my_crown_public', { p_visible: visible });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.myReputation });
      const username = profile.data?.username?.trim().toLowerCase();
      if (username) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.publicProfile(username) });
      }
    },
  });
}