import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';
import { readEdgeFunctionPayload } from '@/lib/supabase/function-invoke';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import type { RpcRow } from '@/lib/supabase/types';

type Functions = Database['public']['Functions'];

export const MAX_BANK_ACCOUNTS = 5;
export const NUBAN_ACCOUNT_LENGTH = 10;

export type BankAccount = RpcRow<Functions['list_my_bank_accounts']['Returns']>;

export type PaystackBankOption = {
  code: string;
  name: string;
};

export type ResolveBankAccountResult = {
  account_number: string;
  account_name: string;
  bank_code: string;
};

export type ResolveBankAccountErrorCode =
  | 'not_found'
  | 'provider_unavailable'
  | 'invalid_input'
  | 'rate_limited'
  | 'unknown';

type BanksSuccessBody = {
  status: 'ok';
  banks: PaystackBankOption[];
};

type ResolveSuccessBody = {
  status: 'resolved';
  bank_code: string;
  account_number: string;
  account_name: string;
};

const inflightBankList = new Map<string, Promise<PaystackBankOption[]>>();
const inflightResolve = new Map<string, Promise<ResolveBankAccountResult>>();

export function normalizeAccountNumberInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, NUBAN_ACCOUNT_LENGTH);
}

export function isCompleteNuban(accountNumber: string): boolean {
  return /^[0-9]{10}$/.test(accountNumber);
}

export function formatMaskedAccountNumber(accountNumber: string): string {
  const digits = normalizeAccountNumberInput(accountNumber);
  if (digits.length < 4) return digits;
  return `•••• ${digits.slice(-4)}`;
}

function dedupePaystackBanks(banks: PaystackBankOption[]): PaystackBankOption[] {
  const byCode = new Map<string, PaystackBankOption>();
  for (const bank of banks) {
    if (!byCode.has(bank.code)) {
      byCode.set(bank.code, bank);
    }
  }
  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchPaystackBanks(): Promise<PaystackBankOption[]> {
  const cacheKey = 'list';
  const inflight = inflightBankList.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const { data, error } = await supabase.functions.invoke('paystack-banks', { body: {} });
    const payload = await readEdgeFunctionPayload<
      BanksSuccessBody | { banks: PaystackBankOption[] }
    >(data, error, { functionName: 'paystack-banks' });

    const banks =
      'status' in payload && payload.status === 'ok'
        ? (payload.banks ?? [])
        : (payload.banks ?? []);

    return dedupePaystackBanks(banks);
  })().finally(() => {
    inflightBankList.delete(cacheKey);
  });

  inflightBankList.set(cacheKey, promise);
  return promise;
}

export async function resolveBankAccount(input: {
  bankCode: string;
  accountNumber: string;
}): Promise<ResolveBankAccountResult> {
  const key = `${input.bankCode}:${input.accountNumber}`;
  const inflight = inflightResolve.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    const { data, error } = await supabase.functions.invoke('paystack-resolve-account', {
      body: {
        bank_code: input.bankCode,
        account_number: input.accountNumber,
      },
    });

    const payload = await readEdgeFunctionPayload<ResolveSuccessBody | ResolveBankAccountResult>(
      data,
      error,
      { functionName: 'paystack-resolve-account' },
    );

    if ('status' in payload && payload.status === 'resolved') {
      return {
        bank_code: payload.bank_code,
        account_number: payload.account_number,
        account_name: payload.account_name,
      };
    }

    return payload as ResolveBankAccountResult;
  })().finally(() => {
    inflightResolve.delete(key);
  });

  inflightResolve.set(key, promise);
  return promise;
}

export async function saveBankAccount(input: {
  bankCode: string;
  bankName: string;
  accountNumber: string;
}): Promise<{ bank_account_id: string }> {
  const { data, error } = await supabase.functions.invoke('bank-account-save', {
    body: {
      bank_code: input.bankCode,
      bank_name: input.bankName,
      account_number: input.accountNumber,
    },
  });
  return readEdgeFunctionPayload<{ bank_account_id: string }>(data, error, {
    functionName: 'bank-account-save',
  });
}

export function useMyBankAccounts() {
  return useQuery({
    queryKey: queryKeys.bankAccounts,
    queryFn: async (): Promise<BankAccount[]> => {
      const { data, error } = await supabase.rpc('list_my_bank_accounts');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePaystackBanks() {
  return useQuery({
    queryKey: queryKeys.paystackBanks,
    queryFn: fetchPaystackBanks,
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useSetDefaultBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bankAccountId: string) => {
      const { error } = await supabase.rpc('set_default_user_bank_account', {
        p_bank_account_id: bankAccountId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bankAccounts });
    },
  });
}

export function useDeleteBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bankAccountId: string) => {
      const { error } = await supabase.rpc('delete_user_bank_account', {
        p_bank_account_id: bankAccountId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bankAccounts });
    },
  });
}

export function resolveErrorCode(error: unknown): ResolveBankAccountErrorCode {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: string }).code;
    if (
      code === 'not_found' ||
      code === 'provider_unavailable' ||
      code === 'invalid_input' ||
      code === 'rate_limited'
    ) {
      return code;
    }
  }
  return 'unknown';
}
