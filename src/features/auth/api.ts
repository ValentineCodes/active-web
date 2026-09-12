import { MARKET } from '@/config';
import { supabase } from '@/lib/supabase/client';

/**
 * Turns locally entered digits into E.164. A number typed with its national trunk `0`
 * or already carrying the country code both land on the same result.
 */
export function toE164(input: string): string {
  const digits = input.replace(/\D/g, '');
  const countryCode = MARKET.dialCode.replace('+', '');

  if (digits.startsWith(countryCode)) return `+${digits}`;
  return `${MARKET.dialCode}${digits.replace(/^0+/, '')}`;
}

/** Digits a subscriber number can have once the trunk prefix is dropped. */
export function isPlausiblePhone(input: string): boolean {
  const digits = input.replace(/\D/g, '').replace(/^0+/, '');
  return digits.length >= 7 && digits.length <= 14;
}

export async function sendPhoneOtp(phone: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone: toE164(phone) });
  if (error) throw error;
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    phone: toE164(phone),
    token,
    type: 'sms',
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
