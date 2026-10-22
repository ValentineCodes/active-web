import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { type Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { KeyboardStickyFooter } from '@/components/ui/KeyboardStickyFooter';
import { Screen } from '@/components/ui/Screen';
import { InlineError, LoadingState } from '@/components/ui/StateView';
import { formatMaskedAccountNumber, useMyBankAccounts } from '@/features/profile/bank-accounts-api';
import { useMyWallet, invalidateWalletQueries } from '@/features/wallet/api';
import { MARKET } from '@/config';
import { formatMoney } from '@/lib/format';
import { queryClient } from '@/lib/query/client';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import { showAppToast } from '@/lib/toast';
import { requestWalletWithdrawal } from '@/features/wallet/withdraw-api';
import { withdrawErrorMessage } from '@/features/wallet/withdraw-errors';
import {
  clearPendingWithdrawSubmission,
  readPendingWithdrawSubmission,
  setPendingWithdrawSubmission,
} from '@/features/wallet/withdraw-pending';
import { readWithdrawDraftFromParams } from '@/features/wallet/withdraw-navigation';
import {
  resolveWithdrawAmountLimits,
  validateWithdrawAmountMajor,
} from '@/features/wallet/withdraw-limits';
import { usePublicWithdrawalPolicy } from '@/features/wallet/withdraw-policy-api';
import { resolveWithdrawalAfterNetworkError } from '@/features/wallet/withdrawals-api';
import { useColors } from '@/theme';

function createIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `wd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
}

export default function WalletWithdrawReviewScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ amount?: string; bankAccountId?: string }>();
  const draft = readWithdrawDraftFromParams(params);

  const wallet = useMyWallet();
  const bankAccounts = useMyBankAccounts();
  const withdrawalPolicy = usePublicWithdrawalPolicy();
  useQueryErrorToast(wallet);
  useQueryErrorToast(bankAccounts);

  const amountLimits = resolveWithdrawAmountLimits(withdrawalPolicy.data);

  const [submitting, setSubmitting] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const recoveryChecked = useRef(false);

  const amountMajor = Number(draft.amount);
  const currency = wallet.data?.currency ?? MARKET.currency;
  const available = wallet.data?.available ?? 0;
  const validationError = wallet.data
    ? validateWithdrawAmountMajor(amountMajor, available, amountLimits)
    : 'Loading wallet…';

  const account = (bankAccounts.data ?? []).find(
    (row) => row.bank_account_id === draft.bankAccountId,
  );

  useFocusEffect(
    useCallback(() => {
      void wallet.refetch();
      void bankAccounts.refetch();
    }, [bankAccounts.refetch, wallet.refetch]),
  );

  const goToSuccess = useCallback(
    (withdrawalId: string, message: string) => {
      clearPendingWithdrawSubmission();
      idempotencyKeyRef.current = null;
      void invalidateWalletQueries(queryClient);
      const query = new URLSearchParams({
        withdrawalId,
        message,
      }).toString();
      router.replace(`/wallet/withdraw/result?${query}` as Href);
    },
    [],
  );

  useEffect(() => {
    if (recoveryChecked.current) return;
    if (!account || !draft.amount || validationError) return;

    const pending = readPendingWithdrawSubmission();
    if (!pending) {
      recoveryChecked.current = true;
      return;
    }

    if (
      pending.amountMajor !== amountMajor ||
      pending.bankAccountId !== draft.bankAccountId
    ) {
      recoveryChecked.current = true;
      return;
    }

    recoveryChecked.current = true;
    idempotencyKeyRef.current = pending.idempotencyKey;
    setRecovering(true);
    void resolveWithdrawalAfterNetworkError(pending, account.bank_name, account.account_name)
      .then((resolved) => {
        if (resolved) {
          goToSuccess(
            resolved.withdrawalId,
            'Your withdrawal request was already submitted.',
          );
        }
      })
      .catch(() => {
        showAppToast('Could not verify withdrawal status. You can try submitting again.', 'warning');
      })
      .finally(() => setRecovering(false));
  }, [
    account,
    amountMajor,
    draft.amount,
    draft.bankAccountId,
    goToSuccess,
    validationError,
  ]);

  const submit = async () => {
    if (!account || !draft.bankAccountId) {
      setError(new Error('Select a bank account.'));
      return;
    }
    const clientError = validateWithdrawAmountMajor(amountMajor, available, amountLimits);
    if (clientError) {
      setError(new Error(clientError));
      return;
    }

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = createIdempotencyKey();
    }

    const idempotencyKey = idempotencyKeyRef.current;
    setPendingWithdrawSubmission({
      idempotencyKey,
      amountMajor,
      bankAccountId: draft.bankAccountId,
      startedAt: new Date().toISOString(),
    });

    setSubmitting(true);
    setError(null);

    try {
      const result = await requestWalletWithdrawal({
        amountMajor,
        bankAccountId: draft.bankAccountId,
        idempotencyKey,
      });
      const withdrawalId = result.withdrawal_id;
      if (!withdrawalId) {
        throw new Error('Unexpected withdrawal response');
      }
      goToSuccess(withdrawalId, result.message);
    } catch (err) {
      const pending = readPendingWithdrawSubmission();
      if (pending && account) {
        try {
          const resolved = await resolveWithdrawalAfterNetworkError(
            pending,
            account.bank_name,
            account.account_name,
          );
          if (resolved) {
            goToSuccess(
              resolved.withdrawalId,
              'Your withdrawal request was already submitted.',
            );
            return;
          }
        } catch {
          // fall through to surface original error
        }
      }
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (wallet.isPending || bankAccounts.isPending || recovering) {
    return (
      <Screen>
        <Header title="Review withdrawal" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  if (validationError || !account) {
    return (
      <Screen>
        <Header title="Review withdrawal" onBack={() => router.back()} />
        <View className="flex-1 justify-end gap-3 p-5">
          <Text className="text-center text-sm text-muted">
            {validationError ?? 'Bank account not found.'}
          </Text>
          <Button label="Go back" variant="secondary" size="lg" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const amountLabel = formatMoney(amountMajor, currency);

  return (
    <Screen edges={['top']}>
      <KeyboardStickyFooter
        footer={
          <View className="gap-3 p-5">
            <Button
              label="Confirm"
              variant="active"
              size="lg"
              corner="2xl"
              className="w-full"
              loading={submitting}
              disabled={submitting}
              onPress={() => void submit()}
            />
          </View>
        }
      >
        <Header title="Review withdrawal" onBack={() => router.back()} />

        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-6 px-5 pb-8 pt-4"
          showsVerticalScrollIndicator={false}
        >
        <View className="items-center gap-2 py-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
            You&apos;re withdrawing
          </Text>
          <Text className="text-4xl font-bold text-ink">{amountLabel}</Text>
          <Text className="text-center text-sm text-muted">
            Active fee: {formatMoney(0, currency)} (no charge for manual bank transfers)
          </Text>
        </View>

        <View className="gap-4 rounded-2xl border border-hairline bg-elevated p-4">
          <View className="flex-row items-start gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-surface">
              <Ionicons name="business-outline" size={22} color={colors.muted} />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-xs font-semibold uppercase tracking-wide text-subtle">
                Destination
              </Text>
              <Text className="text-base font-semibold text-ink">{account.bank_name}</Text>
              <Text className="text-sm text-muted">
                {formatMaskedAccountNumber(account.account_number)}
              </Text>
              <Text className="text-sm text-ink">{account.account_name}</Text>
            </View>
          </View>

          <View className="h-px bg-hairline" />

          <View className="flex-row items-start gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-warning-soft">
              <Ionicons name="time-outline" size={22} color={colors.warning} />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-base font-semibold text-ink">Manual processing</Text>
              <Text className="text-sm leading-5 text-muted">
                We review each request and send money to your bank manually. It may take some time.
                You&apos;ll be notified when the transfer is confirmed or if we need to return funds.
              </Text>
            </View>
          </View>
        </View>

        {error ? (
          <InlineError
            error={new Error(withdrawErrorMessage(error))}
          />
        ) : null}
        </ScrollView>
      </KeyboardStickyFooter>
    </Screen>
  );
}
