export const DEPOSIT_MIN_KOBO = 10_000;
export const DEPOSIT_MAX_KOBO = 100_000_000;

export function assertDepositAmountKobo(amountKobo: number): void {
  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    throw new Error('amount must be a positive integer in kobo');
  }
  if (amountKobo < DEPOSIT_MIN_KOBO) {
    throw new Error('amount is below the minimum deposit');
  }
  if (amountKobo > DEPOSIT_MAX_KOBO) {
    throw new Error('amount exceeds the maximum deposit');
  }
}

/** Whole naira from the client → kobo without floating-point. */
export function nairaMajorToKobo(amountNaira: number): number {
  if (!Number.isInteger(amountNaira) || amountNaira <= 0) {
    throw new Error('amount_naira must be a positive integer');
  }
  const kobo = amountNaira * 100;
  assertDepositAmountKobo(kobo);
  return kobo;
}
