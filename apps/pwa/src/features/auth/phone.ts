import { MARKET } from '@/config/market';

export function toE164(input: string): string {
  const digits = input.replace(/\D/g, '');
  const countryCode = MARKET.dialCode.replace('+', '');

  if (digits.startsWith(countryCode)) return `+${digits}`;
  return `${MARKET.dialCode}${digits.replace(/^0+/, '')}`;
}

export function isPlausiblePhone(input: string): boolean {
  const digits = input.replace(/\D/g, '').replace(/^0+/, '');
  return digits.length >= 7 && digits.length <= 14;
}
