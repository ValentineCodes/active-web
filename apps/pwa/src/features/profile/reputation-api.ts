import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useMyProfile } from '@/features/profile/api';
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

export function useSetCrownPublic() {
  const queryClient = useQueryClient();
  const profile = useMyProfile();

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