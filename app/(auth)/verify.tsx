import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { InlineError } from '@/components/ui/StateView';
import { sendPhoneOtp, toE164, verifyPhoneOtp } from '@/features/auth/api';
import { colors } from '@/theme';

const CODE_LENGTH = 6;

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');

  // A successful verification sets the session, and the root navigator swaps shells; this
  // screen does not navigate on its own.
  const verify = useMutation({ mutationFn: () => verifyPhoneOtp(phone, code) });
  const resend = useMutation({ mutationFn: () => sendPhoneOtp(phone) });

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-between p-6"
      >
        <View className="mt-16 gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Change phone number"
            hitSlop={8}
          >
            <Text className="text-base font-medium text-brand">Change number</Text>
          </Pressable>

          <Text className="text-3xl font-bold text-ink">Enter your code</Text>
          <Text className="text-lg text-muted">
            We sent a {CODE_LENGTH}-digit code to {toE164(phone)}.
          </Text>
        </View>

        <View className="gap-4">
          <TextInput
            value={code}
            onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={CODE_LENGTH}
            placeholder="000000"
            placeholderTextColor={colors.hairline}
            accessibilityLabel={`${CODE_LENGTH} digit verification code`}
            autoFocus
            className="rounded-2xl border border-hairline bg-surface px-4 py-5 text-center text-3xl tracking-widest text-ink"
          />

          {verify.isError ? <InlineError error={verify.error} /> : null}

          <Pressable
            onPress={() => resend.mutate()}
            disabled={resend.isPending}
            accessibilityRole="button"
            accessibilityLabel="Send the code again"
            hitSlop={8}
          >
            <Text className="text-center text-base font-medium text-brand">
              {resend.isSuccess ? 'Code sent again' : 'Send it again'}
            </Text>
          </Pressable>
        </View>

        <Button
          label="Verify"
          size="lg"
          onPress={() => verify.mutate()}
          disabled={code.length < CODE_LENGTH}
          loading={verify.isPending}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}
