/** Whether the client should collect NIN before calling the withdrawal backend. */
export function shouldCollectNinBeforeWithdrawal(
  requireIdentityVerification: boolean | undefined,
  ninSubmitted: boolean | undefined,
): boolean {
  if (!requireIdentityVerification) return false;
  return ninSubmitted !== true;
}

export function isIdentityVerificationWithdrawalError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: string }).code === 'identity_verification_required';
  }
  if (error instanceof Error) {
    return error.message.toLowerCase().includes('identity verification');
  }
  return false;
}
