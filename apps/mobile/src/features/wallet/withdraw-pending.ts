/** In-flight withdrawal submit context for network recovery (same session). */

export type PendingWithdrawSubmission = {
  idempotencyKey: string;
  amountMajor: number;
  bankAccountId: string;
  startedAt: string;
};

let pending: PendingWithdrawSubmission | null = null;

export function setPendingWithdrawSubmission(context: PendingWithdrawSubmission): void {
  pending = context;
}

export function readPendingWithdrawSubmission(): PendingWithdrawSubmission | null {
  return pending;
}

export function clearPendingWithdrawSubmission(): void {
  pending = null;
}
