/** Integer kobo ↔ major NGN (no floating-point money math). */
export function parseKobo(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  throw new Error('kobo must be an integer');
}

export function majorToKobo(majorUnits: number): number {
  if (!Number.isFinite(majorUnits) || !Number.isInteger(majorUnits)) {
    throw new Error('amount must be a whole number of naira');
  }
  if (majorUnits < 0) throw new Error('amount must not be negative');
  return majorUnits * 100;
}

export function koboToMajor(kobo: number): number {
  if (!Number.isFinite(kobo) || !Number.isInteger(kobo)) {
    throw new Error('kobo must be an integer');
  }
  return kobo / 100;
}
