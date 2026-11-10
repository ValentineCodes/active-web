import { clearSearchRecents } from '@/features/requests/home-search';
import { clearPersistedTagCatalogue } from '@/features/requests/tag-catalogue-storage';
import { clearPendingDepositContext } from '@/features/wallet/deposit-api';
import { clearPendingWithdrawSubmission } from '@/features/wallet/withdraw-pending';

/** Clears non-auth session data so the next account does not inherit wallet or search context. */
export function clearClientUserState(): void {
  clearPendingDepositContext();
  clearPendingWithdrawSubmission();
  void clearSearchRecents();
  void clearPersistedTagCatalogue();
}
