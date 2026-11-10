export type PendingWithdrawSubmission = {
  idempotencyKey: string;
  amountMajor: number;
  bankAccountId: string;
  startedAt: string;
};

const STORAGE_KEY = 'active:wallet-withdraw-pending';

export function setPendingWithdrawSubmission(context: PendingWithdrawSubmission): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
}

export function readPendingWithdrawSubmission(): PendingWithdrawSubmission | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingWithdrawSubmission;
  } catch {
    return null;
  }
}

export function clearPendingWithdrawSubmission(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
