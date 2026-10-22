export type AdminWithdrawalPolicy = {
  minAmountKobo: number;
  maxAmountKobo: number;
  maxDailyAmountKobo: number;
  withdrawalsEnabled: boolean;
  requireAdminReview: boolean;
  requireIdentityVerificationForWithdrawal: boolean;
  allowWithdrawWithoutIdentityInDevelopment: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type AdminWithdrawalPolicyResponse = {
  policy: AdminWithdrawalPolicy;
  deploymentEnvironment: string;
  identityDevelopmentBypassActive: boolean;
};
