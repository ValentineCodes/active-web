import { useCallback } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { type Href, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import {
  formatMaskedAccountNumber,
  MAX_BANK_ACCOUNTS,
  useDeleteBankAccount,
  useMyBankAccounts,
  useSetDefaultBankAccount,
  type BankAccount,
} from '@/features/profile/bank-accounts-api';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import { usePullToRefresh } from '@/lib/query/use-pull-to-refresh';
import { toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';
import { useColors } from '@/theme';

function BankAccountCard({
  row,
  onSetDefault,
  onRemove,
  settingDefault,
  removing,
}: {
  row: BankAccount;
  onSetDefault: () => void;
  onRemove: () => void;
  settingDefault: boolean;
  removing: boolean;
}) {
  const colors = useColors();

  return (
    <View className="gap-3 rounded-2xl border border-hairline bg-elevated p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-lg font-semibold text-ink">{row.bank_name}</Text>
          <Text className="text-base text-muted">
            {formatMaskedAccountNumber(row.account_number)}
          </Text>
          <Text className="text-sm text-muted">{row.account_name}</Text>
        </View>
        {row.is_default ? <Badge label="Default" tone="active" /> : null}
      </View>

      <View className="flex-row flex-wrap gap-3">
        {!row.is_default ? (
          <Pressable
            onPress={onSetDefault}
            disabled={settingDefault || removing}
            accessibilityRole="button"
            accessibilityLabel="Set as default account"
            className="active:opacity-80"
          >
            <Text className="text-base font-semibold text-active">
              {settingDefault ? 'Updating…' : 'Set as default'}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={onRemove}
          disabled={!row.can_delete || removing || settingDefault}
          accessibilityRole="button"
          accessibilityLabel="Remove bank account"
          accessibilityState={{ disabled: !row.can_delete }}
          className="active:opacity-80"
        >
          <Text
            className={
              row.can_delete
                ? 'text-base font-semibold text-danger'
                : 'text-base font-semibold text-muted'
            }
          >
            {removing ? 'Removing…' : 'Remove'}
          </Text>
        </Pressable>
      </View>

      {!row.can_delete ? (
        <View className="flex-row items-center gap-2">
          <Ionicons name="information-circle-outline" size={16} color={colors.subtle} />
          <Text className="flex-1 text-sm text-muted">
            This account is tied to a withdrawal in progress and cannot be removed yet.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function BankAccountsScreen() {
  const accounts = useMyBankAccounts();
  useQueryErrorToast(accounts);
  const setDefault = useSetDefaultBankAccount();
  const remove = useDeleteBankAccount();

  const onRefresh = useCallback(async () => {
    await accounts.refetch();
  }, [accounts]);
  const { refreshing, onRefresh: onPullRefresh } = usePullToRefresh(onRefresh);

  const confirmRemove = (row: BankAccount) => {
    Alert.alert(
      'Remove bank account?',
      `${row.bank_name} (${formatMaskedAccountNumber(row.account_number)}) will be removed from your profile.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void remove.mutateAsync(row.bank_account_id).then(
              () => showAppToast('Account removed'),
              (error) => showAppToast(toUserMessage(error), 'warning'),
            );
          },
        },
      ],
    );
  };

  if (accounts.isPending) {
    return (
      <Screen edges={['top']}>
        <Header title="Bank accounts" onBack={() => router.back()} />
        <LoadingState />
      </Screen>
    );
  }

  const rows = accounts.data ?? [];
  const atLimit = rows.length >= MAX_BANK_ACCOUNTS;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Bank accounts" onBack={() => router.back()} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pb-8 pt-2"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />}
      >
        <Text className="text-sm leading-5 text-muted">
          Saved accounts are used when you withdraw money from your Active wallet. Your default
          account is pre-selected for payouts.
        </Text>

        {accounts.isError ? <InlineError error={accounts.error} /> : null}

        {rows.length === 0 ? (
          <EmptyState
            layout="list"
            icon="card-outline"
            title="No bank accounts yet"
            message="Add a Nigerian bank account to receive withdrawals."
          />
        ) : (
          <View className="gap-3">
            {rows.map((row) => (
              <BankAccountCard
                key={row.bank_account_id}
                row={row}
                settingDefault={setDefault.isPending}
                removing={remove.isPending}
                onSetDefault={() => {
                  void setDefault.mutateAsync(row.bank_account_id).then(
                    () => showAppToast('Default account updated'),
                    (error) => showAppToast(toUserMessage(error), 'warning'),
                  );
                }}
                onRemove={() => confirmRemove(row)}
              />
            ))}
          </View>
        )}

        <Button
          label="Add bank account"
          variant="active"
          size="lg"
          corner="2xl"
          className="w-full"
          disabled={atLimit}
          onPress={() => router.push('/profile/bank-accounts/add' as Href)}
        />

        {atLimit ? (
          <Text className="text-center text-sm text-muted">
            You can save up to {MAX_BANK_ACCOUNTS} accounts.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
