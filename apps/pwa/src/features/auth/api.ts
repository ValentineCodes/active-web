import { toE164 } from '@/features/auth/phone';
import { clearClientUserState } from '@/lib/clear-client-user-state';
import { queryClient } from '@/lib/query/client';
import { supabase } from '@/lib/supabase/client';

export { isPlausiblePhone, toE164 } from '@/features/auth/phone';

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
  clearClientUserState();
  queryClient.clear();
}
