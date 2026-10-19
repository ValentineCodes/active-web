import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { BankPickerSheet, type BankPickerSheetHandle } from '@/components/profile/BankPickerSheet';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { KeyboardStickyFooter } from '@/components/ui/KeyboardStickyFooter';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { InlineError } from '@/components/ui/StateView';
import {
  MAX_BANK_ACCOUNTS,
  normalizeAccountNumberInput,
  saveBankAccount,
  useMyBankAccounts,
  usePaystackBanks,
  type PaystackBankOption,
} from '@/features/profile/bank-accounts-api';
import { useBankAccountLookup } from '@/features/profile/use-bank-account-lookup';
import { queryKeys } from '@/lib/query/keys';
import { useQueryErrorToast } from '@/lib/query/use-query-error-toast';
import { toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';
import { readWalletReturnTo } from '@/features/wallet/deposit-navigation';
import { useColors } from '@/theme';

export default function AddBankAccountScreen() {
  const { returnTo: returnToParam } = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = readWalletReturnTo(returnToParam);
  const colors = useColors();
  const bankPickerRef = useRef<BankPickerSheetHandle>(null);
  const accounts = useMyBankAccounts();
  const banksQuery = usePaystackBanks();
  useQueryErrorToast(banksQuery, { enabled: banksQuery.isError && !banksQuery.data });

  const [selectedBank, setSelectedBank] = useState<PaystackBankOption | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [saveError, setSaveError] = useState<unknown>(null);
  const queryClient = useQueryClient();

  const digits = normalizeAccountNumberInput(accountNumber);
  const lookup = useBankAccountLookup({
    bankCode: selectedBank?.code ?? null,
    accountNumber: digits,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedBank || !lookup.canSave) {
        throw new Error('Resolve the account before saving.');
      }
      return saveBankAccount({
        bankCode: selectedBank.code,
        bankName: selectedBank.name,
        accountNumber: digits,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.bankAccounts });
      showAppToast('Bank account saved');
      if (returnTo) {
        router.replace(returnTo as Href);
      } else {
        router.back();
      }
    },
    onError: (error) => {
      setSaveError(error);
    },
  });

  const atAccountLimit = (accounts.data?.length ?? 0) >= MAX_BANK_ACCOUNTS;

  const openBankPicker = () => {
    if (banksQuery.isError) {
      void banksQuery.refetch();
    }
    bankPickerRef.current?.present();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardStickyFooter
        footer={
          <View className="gap-3 p-5">
            {saveError ? <InlineError error={saveError} /> : null}
            <Button
              label="Save account"
              variant="active"
              size="lg"
              corner="2xl"
              className="w-full"
              disabled={!lookup.canSave || save.isPending || atAccountLimit}
              loading={save.isPending}
              onPress={() => {
                if (save.isPending) return;
                setSaveError(null);
                save.mutate();
              }}
            />
          </View>
        }
      >
        <Header title="Add bank account" onBack={() => router.back()} />

        <ScrollView
          contentContainerClassName="gap-5 px-5 pb-8 pt-2"
          keyboardShouldPersistTaps="handled"
          className="flex-1"
        >
          {atAccountLimit ? (
            <Text className="text-sm text-warning">
              You already have {MAX_BANK_ACCOUNTS} saved accounts. Remove one before adding another.
            </Text>
          ) : null}

          <View className="gap-2">
            <Text className="text-sm font-semibold text-ink">Bank</Text>
            <Pressable
              onPress={openBankPicker}
              accessibilityRole="button"
              accessibilityLabel="Select bank"
              className="flex-row items-center justify-between rounded-2xl border-2 border-transparent bg-surface px-4 py-4 active:opacity-90"
            >
              <Text className={selectedBank ? 'text-lg text-ink' : 'text-lg text-muted'}>
                {selectedBank?.name ?? 'Select bank'}
              </Text>
              <Ionicons name="chevron-down" size={20} color={colors.subtle} />
            </Pressable>
          </View>

          <TextField
            label="Account number"
            value={digits}
            onChangeText={(text) => {
              setSaveError(null);
              setAccountNumber(normalizeAccountNumberInput(text));
            }}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="10-digit NUBAN"
            hint={selectedBank ? undefined : 'Select a bank first'}
          />

          {lookup.state.status === 'loading' ? (
            <View className="flex-row items-center gap-2 px-1">
              <ActivityIndicator size="small" color={colors.active} />
              <Text className="text-sm text-muted">Looking up account…</Text>
            </View>
          ) : null}

          {lookup.state.status === 'resolved' ? (
            <Text className="px-1 text-base font-semibold text-ink">{lookup.state.accountName}</Text>
          ) : null}

          {lookup.state.status === 'not_found' ? (
            <Text className="px-1 text-sm text-danger" accessibilityRole="alert">
              {lookup.state.message}
            </Text>
          ) : null}

          {lookup.state.status === 'provider_error' ? (
            <View className="gap-2 rounded-2xl border border-hairline bg-elevated px-4 py-3">
              <Text className="text-sm text-muted">{lookup.state.message}</Text>
              <Pressable
                onPress={lookup.retry}
                accessibilityRole="button"
                accessibilityLabel="Retry account lookup"
                className="self-start active:opacity-80"
              >
                <Text className="text-base font-semibold text-active">Try again</Text>
              </Pressable>
            </View>
          ) : null}

          {banksQuery.isError && !banksQuery.data ? (
            <Pressable
              onPress={() => void banksQuery.refetch()}
              accessibilityRole="button"
              className="active:opacity-80"
            >
              <Text className="text-sm font-semibold text-active">Reload bank list</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardStickyFooter>

      <BankPickerSheet
        ref={bankPickerRef}
        banks={banksQuery.data ?? []}
        loading={banksQuery.isPending}
        errorMessage={
          banksQuery.isError ? toUserMessage(banksQuery.error) : null
        }
        selectedCode={selectedBank?.code ?? null}
        onSelect={(bank) => {
          setSaveError(null);
          setSelectedBank(bank);
        }}
        onDismiss={() => {}}
      />
    </Screen>
  );
}
