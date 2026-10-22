import { toUserMessage } from '@/lib/supabase/errors';

import { withdrawErrorCode } from './withdraw-api';

export function withdrawErrorMessage(error: unknown): string {
  const code = withdrawErrorCode(error);

  switch (code) {
    case 'insufficient_balance':
      return 'You do not have enough available balance for this withdrawal.';
    case 'invalid_bank_account':
      return 'That bank account is no longer available. Choose another account or add a new one.';
    case 'invalid_amount':
      return 'Enter a valid withdrawal amount within the allowed limits.';
    case 'withdrawal_in_progress':
      return 'This bank account already has a withdrawal in progress.';
    case 'withdrawals_disabled':
      return 'Withdrawals are temporarily unavailable. Try again later.';
    case 'identity_verification_required':
      return 'Identity verification is required before you can withdraw. If you are on local Supabase, run pnpm db:reset so development settings apply.';
    default:
      return toUserMessage(error);
  }
}
