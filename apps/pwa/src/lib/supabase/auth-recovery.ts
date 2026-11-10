import { supabase } from '@/lib/supabase/client';
import { isNetworkError } from '@/lib/supabase/errors';

const AUTH_POSTGREST_CODES = new Set(['PGRST301', '42501']);

export function isSupabaseAuthError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'string' && AUTH_POSTGREST_CODES.has(code)) return true;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message).toLowerCase();
    return (
      message.includes('jwt') ||
      message.includes('invalid authentication credentials') ||
      message.includes('not authenticated') ||
      message.includes('invalid claim')
    );
  }
  return false;
}

export function isSupabaseRefreshAuthFailure(error: unknown): boolean {
  if (!error) return false;
  if (isNetworkError(error)) return false;

  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (status === 401 || status === 403) return true;
  }

  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code: unknown }).code).toLowerCase();
    if (
      code.includes('refresh_token') ||
      code === 'session_not_found' ||
      code === 'bad_jwt' ||
      code === 'invalid_jwt'
    ) {
      return true;
    }
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message).toLowerCase();
    if (
      message.includes('refresh token') ||
      message.includes('invalid refresh token') ||
      message.includes('session expired') ||
      message.includes('invalid claim')
    ) {
      return true;
    }
  }

  return false;
}

export async function recoverSessionOnAuthError(): Promise<'refreshed' | 'signed_out'> {
  const { data, error } = await supabase.auth.refreshSession();
  if (!error && data.session) return 'refreshed';
  if (error && !isSupabaseRefreshAuthFailure(error)) return 'refreshed';
  await supabase.auth.signOut();
  return 'signed_out';
}
