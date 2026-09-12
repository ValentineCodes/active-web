import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { InlineError } from '@/components/ui/StateView';
import { MARKET } from '@/config';
import { isPlausiblePhone, sendPhoneOtp } from '@/features/auth/api';
import { colors } from '@/theme';

export default function PhoneScreen() {
  const [phone, setPhone] = useState('');

  const sendCode = useMutation({
    mutationFn: () => sendPhoneOtp(phone),
    onSuccess: () => router.push({ pathname: '/verify', params: { phone } }),
  });

  const canContinue = isPlausiblePhone(phone);

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-between p-6"
      >
        <View className="mt-16 gap-3">
          <Text className="text-4xl font-bold text-ink">Active</Text>
          <Text className="text-lg text-muted">
            Tell people nearby what you need. Or be the one who helps.
          </Text>
        </View>

        <View className="gap-4">
          <Text className="text-sm font-semibold text-ink">Your phone number</Text>

          <View className="flex-row items-center rounded-2xl border border-hairline bg-surface px-4">
            <Text className="text-base text-muted">{MARKET.dialCode}</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              placeholder="801 234 5678"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Your phone number"
              autoFocus
              className="flex-1 py-4 pl-3 text-lg text-ink"
            />
          </View>

          <Text className="text-sm text-muted">
            We send a code by SMS to confirm it&apos;s you. We never ask for your location here.
          </Text>

          {sendCode.isError ? <InlineError error={sendCode.error} /> : null}
        </View>

        <Button
          label="Send code"
          size="lg"
          onPress={() => sendCode.mutate()}
          disabled={!canContinue}
          loading={sendCode.isPending}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}
