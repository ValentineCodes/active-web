'use client';

import { useQuery } from '@tanstack/react-query';

import { koboToMajor } from '@/features/wallet/kobo';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

export type PublicWithdrawalPolicy = {
  withdrawalsEnabled: boolean;
  minAmountMajor: number;
  maxAmountMajor: number;
  maxDailyAmountMajor: number;
  requireAdminReview: boolean;
  requireIdentityVerification: boolean;
};

type PolicyJson = {
  withdrawals_enabled: boolean;
  min_amount_kobo: number;
  max_amount_kobo: number;
  max_daily_amount_kobo: number;
  require_admin_review: boolean;
  require_identity_verification: boolean;
};

function mapPolicy(body: PolicyJson): PublicWithdrawalPolicy {
  return {
    withdrawalsEnabled: body.withdrawals_enabled,
    minAmountMajor: koboToMajor(body.min_amount_kobo),
    maxAmountMajor: koboToMajor(body.max_amount_kobo),
    maxDailyAmountMajor: koboToMajor(body.max_daily_amount_kobo),
    requireAdminReview: body.require_admin_review,
    requireIdentityVerification: body.require_identity_verification,
  };
}

export async function fetchPublicWithdrawalPolicy(): Promise<PublicWithdrawalPolicy> {
  const { data, error } = await supabase.rpc('get_public_withdrawal_policy');
  if (error) throw error;
  if (!data || typeof data !== 'object') {
    throw new Error('Withdrawal policy unavailable');
  }
  return mapPolicy(data as PolicyJson);
}

export function usePublicWithdrawalPolicy() {
  return useQuery({
    queryKey: queryKeys.withdrawalPolicy,
    queryFn: fetchPublicWithdrawalPolicy,
    staleTime: 60_000,
    retry: false,
  });
}
