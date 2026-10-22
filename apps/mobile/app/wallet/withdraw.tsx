import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { WithdrawBankAccountOption } from '@/components/wallet/WithdrawBankAccountOption';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { KeyboardStickyFooter } from '@/components/ui/KeyboardStickyFooter';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, LoadingState } from '@/components/ui/StateView';
import { useMyBankAccounts, type BankAccount } from '@/features/profile/bank-accounts-api';
import { useMyWallet } from '@/features/wallet/api';
import {
  addBankAccountHrefFromWithdraw,
  readWithdrawDraftFromParams,
  withdrawReviewHref,
} from '@/features/wallet/withdraw-navigation';
import {
  resolveWithdrawAmountLimits,
  validateWithdrawAmountMajor,
} from '@/features/wallet/withdraw-limits';
import { usePublicWithdrawalPolicy } from '@/features/wallet/withdraw-policy-api';
import { MARKET } from '@/config';
import { formatMoney } from '@/lib/format';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
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
  const withdrawalPolicy = usePublicWithdrawalPolicy();
  useQueryErrorToast(wallet);
  useQueryErrorToast(bankAccounts);

  const amountLimits = resolveWithdrawAmountLimits(withdrawalPolicy.data);

  const [amount, setAmount] = useState(draft.amount);
  const [manualBankAccountId, setManualBankAccountId] = useState<string | null>(null);

  const available = wallet.data?.available ?? 0;
  const currency = wallet.data?.currency ?? MARKET.currency;
  const parsedAmount = Number(amount.replace(/[^\d]/g, ''));
  const validationError = wallet.data
    ? validateWithdrawAmountMajor(parsedAmount, available, amountLimits)
    : null;

  const withdrawalsDisabled = withdrawalPolicy.data?.withdrawalsEnabled === false;

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
      void withdrawalPolicy.refetch();
    }, [bankAccounts.refetch, wallet.refetch, withdrawalPolicy.refetch]),
  );

  const canContinue =
    Boolean(selectedBankAccountId) &&
    parsedAmount > 0 &&
    !validationError &&
    accounts.length > 0 &&
    !withdrawalsDisabled;

  const dependencyNote = useMemo(
    () =>
      'Withdrawals are reviewed and sent to your bank manually. Processing can take time. Only your available balance can be withdrawn — not locked request funds.',
    [],
  );

  const continueToReview = () => {
    if (!selectedBankAccountId || !canContinue) return;
    router.push(
      withdrawReviewHref({
        amount: String(parsedAmount),
        bankAccountId: selectedBankAccountId,
      }),
    );
  };

  if (wallet.isPending || bankAccounts.isPending || withdrawalPolicy.isPending) {
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
            <Button
              label="Review withdrawal"
              variant="active"
              size="lg"
              corner="2xl"
              className="w-full"
              disabled={!canContinue}
              onPress={continueToReview}
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

          {withdrawalsDisabled ? (
            <View className="rounded-2xl border border-warning/30 bg-warning-soft px-4 py-4">
              <Text className="text-sm font-semibold text-warning">Withdrawals paused</Text>
              <Text className="mt-1 text-sm text-muted">
                New withdrawal requests are temporarily unavailable. Try again later.
              </Text>
            </View>
          ) : null}

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
                onChangeText={(text) => setAmount(text.replace(/[^\d]/g, ''))}
              />
            </View>
            {validationError ? (
              <Text className="text-sm text-danger" accessibilityRole="alert">
                {validationError}
              </Text>
            ) : (
              <Text className="text-sm text-muted">
                Min {formatMoney(amountLimits.minMajor, currency)} · Max{' '}
                {formatMoney(amountLimits.maxMajor, currency)}
              </Text>
            )}
          </View>

          <View className="gap-3">
            <Text className="text-lg font-bold text-ink">Bank account</Text>
            {accounts.length === 0 ? (
              <View className="gap-4">
                <EmptyState
                  layout="list"
                  icon="card-outline"
                  title="Add a bank account"
                  message="Save a bank account before you can withdraw."
                />
                <Button
                  label="Add bank account"
                  variant="active"
                  size="lg"
                  corner="2xl"
                  className="w-full"
                  onPress={() =>
                    router.push(
                      addBankAccountHrefFromWithdraw({
                        amount,
                        bankAccountId: selectedBankAccountId,
                      }),
                    )
                  }
                />
              </View>
            ) : (
              <View className="overflow-hidden rounded-2xl border border-hairline bg-elevated">
                {accounts.map((account, index) => (
                  <WithdrawBankAccountOption
                    key={account.bank_account_id}
                    account={account}
                    selected={account.bank_account_id === selectedBankAccountId}
                    showDivider={index > 0}
                    onSelect={() => setManualBankAccountId(account.bank_account_id)}
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
