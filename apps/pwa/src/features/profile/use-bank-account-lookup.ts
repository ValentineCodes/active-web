'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { resolveBankAccount, resolveErrorCode } from '@/features/profile/bank-accounts-api';
import {
  buildLookupKey,
  projectLookupState,
  type LookupRecord,
} from '@/features/profile/bank-account-lookup-state';

const LOOKUP_DEBOUNCE_MS = 400;

export type { BankAccountLookupState } from '@/features/profile/bank-account-lookup-state';
export { buildLookupKey, projectLookupState } from '@/features/profile/bank-account-lookup-state';

type LookupInput = {
  bankCode: string | null;
  accountNumber: string;
};

export function useBankAccountLookup({ bankCode, accountNumber }: LookupInput) {
  const [lookup, setLookup] = useState<LookupRecord | null>(null);
  const generationRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentKey = useMemo(
    () => buildLookupKey(bankCode, accountNumber),
    [bankCode, accountNumber],
  );

  const state = projectLookupState(lookup, currentKey);

  const runLookup = useCallback(
    async (generation: number, key: string, bank: string, account: string) => {
      setLookup({ key, status: 'loading' });

      try {
        const result = await resolveBankAccount({
          bankCode: bank,
          accountNumber: account,
        });

        if (generationRef.current !== generation) return;

        setLookup({ key, status: 'resolved', accountName: result.account_name });
      } catch (error) {
        if (generationRef.current !== generation) return;

        const code = resolveErrorCode(error);
        const message = error instanceof Error ? error.message : 'Could not look up this account.';

        if (code === 'not_found') {
          setLookup({ key, status: 'not_found', message });
          return;
        }

        if (code === 'rate_limited') {
          setLookup({
            key,
            status: 'provider_error',
            message: message || 'Too many lookups. Wait a moment and try again.',
          });
          return;
        }

        if (code === 'provider_unavailable' || code === 'unknown') {
          setLookup({
            key,
            status: 'provider_error',
            message: message || 'Bank lookup is temporarily unavailable. Try again.',
          });
          return;
        }

        setLookup({ key, status: 'not_found', message });
      }
    },
    [],
  );

  const digits = useMemo(() => accountNumber.replace(/\D/g, ''), [accountNumber]);

  const retry = useCallback(() => {
    if (!currentKey || !bankCode) return;
    generationRef.current += 1;
    const generation = generationRef.current;
    void runLookup(generation, currentKey, bankCode, digits);
  }, [bankCode, currentKey, digits, runLookup]);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!currentKey || !bankCode) {
      return;
    }

    debounceRef.current = setTimeout(() => {
      if (generationRef.current !== generation) return;
      void runLookup(generation, currentKey, bankCode, digits);
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [bankCode, currentKey, digits, runLookup]);

  const canSave = state.status === 'resolved';

  return { state, canSave, retry };
}
