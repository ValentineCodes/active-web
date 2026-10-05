import { type ComponentRef, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { Header } from '@/components/ui/Header';
import { KeyboardStickyFooter } from '@/components/ui/KeyboardStickyFooter';
import { Screen } from '@/components/ui/Screen';
import { InlineError } from '@/components/ui/StateView';
import { MARKET, WALLET } from '@/config';
import { validateDepositAmountMajor } from '@/features/wallet/deposit-limits';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/cn';

export default function WalletAddMoneyScreen() {
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [amount, setAmount] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const parsedAmount = Number(amount.replace(/[^\d]/g, ''));
  const hasAmount = parsedAmount > 0;
  const currency = MARKET.currency;

  const continueToReview = () => {
    const error = validateDepositAmountMajor(parsedAmount);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    router.push({
      pathname: '/wallet/deposit/review',
      params: { amount: String(parsedAmount) },
    });
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardStickyFooter
        footer={
          <View className="gap-3 p-5">
            {validationError ? <InlineError error={new Error(validationError)} /> : null}
            <Button
              label="Continue"
              variant="active"
              size="lg"
              corner="2xl"
              className="w-full"
              disabled={!hasAmount}
              onPress={continueToReview}
            />
          </View>
        }
      >
        <Header title="Add money" onBack={() => router.back()} />

        <ScrollView
          contentContainerClassName="gap-6 px-5 pb-8 pt-2"
          keyboardShouldPersistTaps="handled"
          className="flex-1"
        >
          <View className="gap-2">
            <Text className="text-3xl font-bold leading-9 text-ink">
              How much would you like to add?
            </Text>
            <Text className="text-base text-muted">
              This money will be available to fund requests after payment is confirmed.
            </Text>
          </View>

          <Pressable
            accessibilityRole="none"
            onPress={() => inputRef.current?.focus()}
            className={cn(
              'flex-row items-center rounded-2xl border bg-surface px-5 py-6',
              hasAmount ? 'border-active' : 'border-hairline',
            )}
          >
            <MoneyAmountInput
              inputRef={inputRef}
              accessibilityLabel="Amount to add"
              value={amount}
              onChangeText={(text) => {
                setAmount(text.replace(/[^\d]/g, ''));
                setValidationError(null);
              }}
            />
          </Pressable>

          <View className="flex-row flex-wrap gap-2">
            {WALLET.addMoneyAmounts.map((preset) => {
              const selected = parsedAmount === preset;
              return (
                <Pressable
                  key={preset}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setAmount(String(preset));
                    setValidationError(null);
                  }}
                  className={cn(
                    'rounded-xl px-4 py-2.5 active:opacity-90',
                    selected ? 'border border-active bg-surface' : 'bg-surface',
                  )}
                >
                  <Text
                    className={cn(
                      'text-base font-semibold',
                      selected ? 'text-active' : 'text-muted',
                    )}
                  >
                    {formatMoney(preset, currency)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="text-sm text-muted">
            Min {formatMoney(WALLET.depositMinMajor, currency)} · Max{' '}
            {formatMoney(WALLET.depositMaxMajor, currency)}
          </Text>
        </ScrollView>
      </KeyboardStickyFooter>
    </Screen>
  );
}
