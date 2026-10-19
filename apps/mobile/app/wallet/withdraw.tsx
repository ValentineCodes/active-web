import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';

import { WithdrawBankAccountOption } from '@/components/wallet/WithdrawBankAccountOption';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { KeyboardStickyFooter } from '@/components/ui/KeyboardStickyFooter';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { useMyBankAccounts, type BankAccount } from '@/features/profile/bank-accounts-api';
import { useMyWallet, invalidateWalletQueries } from '@/features/wallet/api';
import { requestWalletWithdrawal } from '@/features/wallet/withdraw-api';
import {
  addBankAccountHrefFromWithdraw,
  readWithdrawDraftFromParams,
} from '@/features/wallet/withdraw-navigation';
import { validateWithdrawAmountMajor } from '@/features/wallet/withdraw-limits';
import { MARKET, WALLET } from '@/config';
import { formatMoney } from '@/lib/format';
import { queryClient } from '@/lib/query/client';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import { showAppToast } from '@/lib/toast';
import { cn } from '@/lib/cn';

function pickInitialBankAccount(
  accounts: BankAccount[],
  preferredId: string | null,
): string | null {
  if (accounts.length === 0) return null;
  if (preferredId && accounts.some((row) => row.bank_account_id === preferredId)) {
    return preferredId;
  }
  const defaultAccount = accounts.find((row) => row.is_default);
  const first = accounts[0];
  return defaultAccount?.bank_account_id ?? first?.bank_account_id ?? null;
}

export default function WalletWithdrawScreen() {
  const params = useLocalSearchParams<{
    amount?: string;
    bankAccountId?: string;
  }>();
  const draft = readWithdrawDraftFromParams(params);

  const wallet = useMyWallet();
  const bankAccounts = useMyBankAccounts();
  useQueryErrorToast(wallet);
  useQueryErrorToast(bankAccounts);

  const [amount, setAmount] = useState(draft.amount);
  const [manualBankAccountId, setManualBankAccountId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const available = wallet.data?.available ?? 0;
  const currency = wallet.data?.currency ?? MARKET.currency;
  const parsedAmount = Number(amount.replace(/[^\d]/g, ''));
  const validationError = wallet.data
    ? validateWithdrawAmountMajor(parsedAmount, available)
    : null;

  const accounts = useMemo(() => bankAccounts.data ?? [], [bankAccounts.data]);

  const selectedBankAccountId = useMemo(() => {
    if (!bankAccounts.isSuccess || accounts.length === 0) return null;
    if (
      manualBankAccountId &&
      accounts.some((row) => row.bank_account_id === manualBankAccountId)
    ) {
      return manualBankAccountId;
    }
    return pickInitialBankAccount(accounts, draft.bankAccountId);
  }, [accounts, bankAccounts.isSuccess, draft.bankAccountId, manualBankAccountId]);

  useFocusEffect(
    useCallback(() => {
      void wallet.refetch();
      void bankAccounts.refetch();
    }, [bankAccounts, wallet]),
  );

  const submit = useMutation({
    mutationFn: async () => {
      if (!selectedBankAccountId) {
        throw new Error('Select a bank account.');
      }
      const error = validateWithdrawAmountMajor(parsedAmount, available);
      if (error) {
        throw new Error(error);
      }
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current =
          globalThis.crypto?.randomUUID?.() ??
          `wd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      }
      return requestWalletWithdrawal({
        amountMajor: parsedAmount,
        bankAccountId: selectedBankAccountId,
        idempotencyKey: idempotencyKeyRef.current,
      });
    },
    onSuccess: async (result) => {
      idempotencyKeyRef.current = null;
      await invalidateWalletQueries(queryClient);
      showAppToast(result.message, { type: 'info' });
      router.back();
    },
    onError: (error) => {
      setSubmitError(error);
    },
  });

  const canSubmit =
    Boolean(selectedBankAccountId) &&
    parsedAmount > 0 &&
    !validationError &&
    !submit.isPending &&
    accounts.length > 0;

  const dependencyNote = useMemo(
    () =>
      'Bank transfer settlement runs on the server after your request is accepted. You will get a notification when it completes.',
    [],
  );

  if (wallet.isPending || bankAccounts.isPending) {
    return (
      <Screen>
        <Header title="Withdraw" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardStickyFooter
        footer={
          <View className="gap-3 p-5">
            {submitError ? <InlineError error={submitError} /> : null}
            <Button
              label="Request withdrawal"
              variant="active"
              size="lg"
              corner="2xl"
              className="w-full"
              disabled={!canSubmit}
              loading={submit.isPending}
              onPress={() => {
                setSubmitError(null);
                submit.mutate();
              }}
            />
          </View>
        }
      >
        <Header title="Withdraw" onBack={() => router.back()} />

        <ScrollView
          contentContainerClassName="gap-6 px-5 pb-8 pt-2"
          keyboardShouldPersistTaps="handled"
          className="flex-1"
        >
          <View className="gap-2 rounded-2xl border border-hairline bg-elevated px-4 py-4">
            <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
              Available to withdraw
            </Text>
            <Text className="text-3xl font-bold text-ink">{formatMoney(available, currency)}</Text>
            <Text className="text-sm text-muted">Only available balance can be withdrawn.</Text>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-semibold text-ink">Amount</Text>
            <View
              className={cn(
                'flex-row items-center rounded-2xl border bg-surface px-5 py-5',
                parsedAmount > 0 && !validationError ? 'border-active' : 'border-hairline',
              )}
            >
              <MoneyAmountInput
                accessibilityLabel="Withdrawal amount"
                value={amount}
                onChangeText={(text) => {
                  setSubmitError(null);
                  setAmount(text.replace(/[^\d]/g, ''));
                }}
              />
            </View>
            {validationError ? (
              <Text className="text-sm text-danger" accessibilityRole="alert">
                {validationError}
              </Text>
            ) : (
              <Text className="text-sm text-muted">
                Min {formatMoney(WALLET.withdrawMinMajor, currency)} · Max{' '}
                {formatMoney(WALLET.withdrawMaxMajor, currency)}
              </Text>
            )}
          </View>

          <View className="gap-3">
            <Text className="text-lg font-bold text-ink">Bank account</Text>
            {accounts.length === 0 ? (
              <EmptyState
                layout="list"
                icon="card-outline"
                title="Add a bank account"
                message="Save a bank account before you can withdraw."
              />
            ) : (
              <View className="overflow-hidden rounded-2xl border border-hairline bg-elevated">
                {accounts.map((account, index) => (
                  <WithdrawBankAccountOption
                    key={account.bank_account_id}
                    account={account}
                    selected={account.bank_account_id === selectedBankAccountId}
                    showDivider={index > 0}
                    onSelect={() => {
                      setSubmitError(null);
                      setManualBankAccountId(account.bank_account_id);
                    }}
                  />
                ))}
              </View>
            )}

            <Pressable
              onPress={() =>
                router.push(
                  addBankAccountHrefFromWithdraw({
                    amount,
                    bankAccountId: manualBankAccountId ?? selectedBankAccountId,
                  }),
                )
              }
              accessibilityRole="button"
              accessibilityLabel="Add another bank account"
              className="self-start active:opacity-80"
            >
              <Text className="text-base font-semibold text-active">Add bank account</Text>
            </Pressable>
          </View>

          <Text className="text-sm leading-5 text-muted">{dependencyNote}</Text>
        </ScrollView>
      </KeyboardStickyFooter>
    </Screen>
  );
}
