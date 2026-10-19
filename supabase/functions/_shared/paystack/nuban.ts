/** Nigerian NUBAN account numbers are 10 digits. Bank codes come from Paystack's bank list. */

export const NUBAN_LENGTH = 10;

export type ParsedNubanInput =
  | { ok: true; bankCode: string; accountNumber: string }
  | { ok: false; code: 'invalid_input'; message: string };

export function normalizeAccountNumberDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function isValidNubanAccountNumber(accountNumber: string): boolean {
  return /^[0-9]{10}$/.test(accountNumber);
}

export function isValidPaystackBankCode(bankCode: string): boolean {
  return /^[0-9]{3,6}$/.test(bankCode);
}

export function parseNubanResolveInput(input: {
  bank_code?: string;
  account_number?: string;
}): ParsedNubanInput {
  const bankCode = input.bank_code?.trim() ?? '';
  const accountNumber = normalizeAccountNumberDigits(input.account_number ?? '');

  if (!bankCode) {
    return { ok: false, code: 'invalid_input', message: 'Select a bank first.' };
  }

  if (!isValidPaystackBankCode(bankCode)) {
    return { ok: false, code: 'invalid_input', message: 'Invalid bank code.' };
  }

  if (!accountNumber) {
    return {
      ok: false,
      code: 'invalid_input',
      message: 'Enter a 10-digit account number.',
    };
  }

  if (!isValidNubanAccountNumber(accountNumber)) {
    return {
      ok: false,
      code: 'invalid_input',
      message: 'Enter a 10-digit account number.',
    };
  }

  return { ok: true, bankCode, accountNumber };
}
