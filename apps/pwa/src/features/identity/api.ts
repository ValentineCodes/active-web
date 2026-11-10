'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/features/auth/use-user-id';
import { queryKeys } from '@/lib/query/keys';
import { readEdgeFunctionPayload } from '@/lib/supabase/function-invoke';
import { supabase } from '@/lib/supabase/client';

export type MyIdentityStatus = {
  ninSubmitted: boolean;
  identityVerified: boolean;
  ninMasked: string | null;
};

type IdentityStatusJson = {
  nin_submitted: boolean;
  identity_verified: boolean;
  nin_masked?: string | null;
};

export async function fetchMyIdentityStatus(): Promise<MyIdentityStatus> {
  const { data, error } = await supabase.rpc('get_my_identity_status');
  if (error) throw error;
  if (!data || typeof data !== 'object') {
    throw new Error('Identity status unavailable');
  }
  const body = data as IdentityStatusJson;
  return {
    ninSubmitted: Boolean(body.nin_submitted),
    identityVerified: Boolean(body.identity_verified),
    ninMasked: typeof body.nin_masked === 'string' ? body.nin_masked : null,
  };
}

export function useMyIdentityStatus() {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.identityStatus(userId),
    queryFn: fetchMyIdentityStatus,
    staleTime: 30_000,
  });
}

export type SubmitNinErrorCode =
  | 'invalid_nin'
  | 'consent_required'
  | 'nin_already_submitted'
  | 'nin_in_use'
  | 'nin_not_configured'
  | 'unknown';

type SubmitNinSuccess = {
  status: 'ok';
  identity_verified: boolean;
};

export async function submitNin(input: { nin: string; consent: boolean }): Promise<void> {
  const { data, error } = await supabase.functions.invoke('identity-nin-submit', {
    body: {
      nin: input.nin,
      consent: input.consent,
    },
  });

  await readEdgeFunctionPayload<SubmitNinSuccess>(data, error, {
    functionName: 'identity-nin-submit',
  });
}

export function submitNinErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: string }).code;
    if (code === 'invalid_nin') {
      return 'Enter your 11-digit National Identification Number (NIN).';
    }
    if (code === 'consent_required') {
      return 'Please agree to how we use your NIN before continuing.';
    }
    if (code === 'nin_already_submitted') {
      return 'Your NIN is already on file.';
    }
    if (code === 'nin_in_use') {
      return 'This NIN is already linked to another account.';
    }
    if (code === 'nin_not_configured') {
      return 'NIN submission is not available on this server yet. If you are developing locally, set NIN_ENCRYPTION_KEY and NIN_FINGERPRINT_KEY in the project .env and run pnpm db:serve.';
    }
    if (code === 'unknown') {
      return 'Could not save your NIN. Try again.';
    }
  }

  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (lower.includes('11-digit')) return error.message;
    if (lower.includes('consent')) return error.message;
    if (lower.includes('already linked')) return error.message;
    if (lower.includes('not configured') || lower.includes('nin_encryption_key')) {
      return 'NIN submission is not available on this server yet. If you are developing locally, set NIN_ENCRYPTION_KEY and NIN_FINGERPRINT_KEY in the project .env and run pnpm db:serve.';
    }
    if (lower.includes('could not save nin')) return 'Could not save your NIN. Try again.';
    if (lower.includes('edge functions')) return error.message;
    if (lower.includes('db:serve')) return error.message;
  }

  return 'Could not save your NIN. Try again.';
}

export function useSubmitNin() {
  const userId = useUserId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: submitNin,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.identityStatus(userId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversationInbox });
      void queryClient.invalidateQueries({ queryKey: ['engagement'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.browseOpen });
      void queryClient.invalidateQueries({ queryKey: queryKeys.browseNearbyAll });
    },
  });
}

export function normalizeNinInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11);
}

export function validateNinInput(value: string): string | null {
  const digits = normalizeNinInput(value);
  if (digits.length === 0) return 'Enter your 11-digit NIN to continue.';
  if (digits.length !== 11) return 'NIN must be exactly 11 digits.';
  return null;
}
