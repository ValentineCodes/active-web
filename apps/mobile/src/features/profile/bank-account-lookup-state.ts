const NUBAN_LENGTH = 10;

function normalizeAccountNumberInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, NUBAN_LENGTH);
}

function isCompleteNuban(accountNumber: string): boolean {
  return /^[0-9]{10}$/.test(accountNumber);
}

export type LookupRecord =
  | { key: string; status: 'loading' }
  | { key: string; status: 'resolved'; accountName: string }
  | { key: string; status: 'not_found'; message: string }
  | { key: string; status: 'provider_error'; message: string };

export type BankAccountLookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'resolved'; accountName: string }
  | { status: 'not_found'; message: string }
  | { status: 'provider_error'; message: string };

export function buildLookupKey(bankCode: string | null, accountNumber: string): string {
  const digits = normalizeAccountNumberInput(accountNumber);
  if (!bankCode || !isCompleteNuban(digits)) return '';
  return `${bankCode}:${digits}`;
}

/** Drops lookup results that no longer match the current bank/account pair (stale responses). */
export function projectLookupState(
  lookup: LookupRecord | null,
  currentKey: string,
): BankAccountLookupState {
  const activeLookup = lookup && lookup.key === currentKey ? lookup : null;

  if (!activeLookup) {
    return { status: 'idle' };
  }

  if (activeLookup.status === 'loading') {
    return { status: 'loading' };
  }

  if (activeLookup.status === 'resolved') {
    return { status: 'resolved', accountName: activeLookup.accountName };
  }

  if (activeLookup.status === 'not_found') {
    return { status: 'not_found', message: activeLookup.message };
  }

  return { status: 'provider_error', message: activeLookup.message };
}
