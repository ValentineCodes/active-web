export function maskBankAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `•••• ${digits.slice(-4)}`;
}
