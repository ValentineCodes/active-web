export function paystackTransactionIsSuccessful(status: string): boolean {
  return status.trim().toLowerCase() === 'success';
}

/** Failed, abandoned, or reversed — not still processing at Paystack. */
export function paystackTransactionIsTerminalFailure(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === 'failed' || normalized === 'abandoned' || normalized === 'reversed';
}