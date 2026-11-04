import type { AdminWithdrawalPolicyResponse } from '@/lib/admin/withdrawal-policy-types';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type {
  AdminWithdrawalPolicy,
  AdminWithdrawalPolicyResponse,
} from '@/lib/admin/withdrawal-policy-types';

type PolicyJson = {
  policy: {
    min_amount_kobo: number;
    max_amount_kobo: number;
    max_daily_amount_kobo: number;
    withdrawals_enabled: boolean;
    require_admin_review: boolean;
    require_identity_verification_for_withdrawal: boolean;
    allow_withdraw_without_identity_in_development: boolean;
    updated_at: string | null;
    updated_by: string | null;
  };
  deployment_environment: string;
  identity_development_bypass_active: boolean;
};

function mapPolicy(body: PolicyJson): AdminWithdrawalPolicyResponse {
  return {
    policy: {
      minAmountKobo: body.policy.min_amount_kobo,
      maxAmountKobo: body.policy.max_amount_kobo,
      maxDailyAmountKobo: body.policy.max_daily_amount_kobo,
      withdrawalsEnabled: body.policy.withdrawals_enabled,
      requireAdminReview: body.policy.require_admin_review,
      requireIdentityVerificationForWithdrawal:
        body.policy.require_identity_verification_for_withdrawal,
      allowWithdrawWithoutIdentityInDevelopment:
        body.policy.allow_withdraw_without_identity_in_development,
      updatedAt: body.policy.updated_at,
      updatedBy: body.policy.updated_by,
    },
    deploymentEnvironment: body.deployment_environment,
    identityDevelopmentBypassActive: body.identity_development_bypass_active,
  };
}

export async function fetchAdminWithdrawalPolicy(): Promise<AdminWithdrawalPolicyResponse> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_withdrawal_policy');
  if (error) throw error;
  if (!data || typeof data !== 'object') {
    throw new Error('Withdrawal policy unavailable');
  }
  return mapPolicy(data as PolicyJson);
}
