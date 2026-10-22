/** Normalize and validate Nigerian NIN (11 digits). Never log the return value. */
export function normalizeNinInput(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\s/g, '');
  if (!/^[0-9]{11}$/.test(digits)) {
    return null;
  }
  return digits;
}

export function ninValidationMessage(): string {
  return 'Enter your 11-digit National Identification Number (NIN).';
}
