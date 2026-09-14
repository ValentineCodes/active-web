import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';

import { AuthFooterButton } from '@/components/auth/AuthFooterButton';
import { OtpDashedInput } from '@/components/auth/OtpDashedInput';
import { Screen } from '@/components/ui/Screen';
import { InlineError } from '@/components/ui/StateView';
import { MARKET } from '@/config';
import { isPlausiblePhone, sendPhoneOtp, toE164, verifyPhoneOtp } from '@/features/auth/api';
import { colors } from '@/theme';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 30;

export default function PhoneScreen() {
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  const [phoneFocused, setPhoneFocused] = useState(false);

  const sendCode = useMutation({
    mutationFn: () => sendPhoneOtp(phone),
    onSuccess: () => {
      setOtpSent(true);
      setResendSecondsLeft(RESEND_COOLDOWN_SEC);
    },
  });

  const verify = useMutation({
    mutationFn: () => verifyPhoneOtp(phone, otp),
  });

  const resend = useMutation({
    mutationFn: () => sendPhoneOtp(phone),
    onSuccess: () => setResendSecondsLeft(RESEND_COOLDOWN_SEC),
  });

  useEffect(() => {
    if (!otpSent || resendSecondsLeft <= 0) return;
    const id = setInterval(() => {
      setResendSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [otpSent, resendSecondsLeft]);

  const digitsOnly = phone.replace(/\D/g, '');
  const canSend = isPlausiblePhone(phone);
  const isOtpComplete = otp.length === CODE_LENGTH;
  const displayNumber = digitsOnly ? toE164(phone) : MARKET.dialCode;

  const handleChangeNumber = () => {
    setOtpSent(false);
    setOtp('');
    setResendSecondsLeft(0);
    sendCode.reset();
    verify.reset();
    resend.reset();
  };

  const handleWhatsMyNumber = () => {
    Alert.alert(
      'Your phone number',
      "You can find your number in your device's Settings under Phone or About.",
    );
  };

  const primaryLoading = otpSent ? verify.isPending : sendCode.isPending;
  const primaryDisabled = otpSent ? !isOtpComplete : !canSend;
  const primaryAction = () => {
    if (otpSent) verify.mutate();
    else sendCode.mutate();
  };

  const mutationError = otpSent ? verify.error : sendCode.error;

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 px-6 pb-8 pt-4"
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          className="mb-6 self-start"
        >
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>

        <Text className="text-2xl font-bold text-ink">
          {otpSent ? 'Verify your number' : 'Enter your phone number'}
        </Text>

        <Text className="mt-3 text-base leading-6 text-muted">
          {otpSent ? (
            <>
              Enter the {CODE_LENGTH}-digit code we sent to{' '}
              <Text className="font-semibold text-ink">{displayNumber}</Text>.{' '}
              <Text
                className="font-semibold text-brand"
                onPress={handleChangeNumber}
                accessibilityRole="button"
              >
                Change number
              </Text>
            </>
          ) : (
            <>
              Active will verify your phone number. Carrier charges may apply.{' '}
              <Text
                className="font-semibold text-brand"
                onPress={handleWhatsMyNumber}
                accessibilityRole="button"
              >
                What&apos;s my number?
              </Text>
            </>
          )}
        </Text>

        {!otpSent ? (
          <View
            className="mt-8 pb-2"
            style={{
              borderBottomWidth: phoneFocused ? 2 : 1,
              borderBottomColor: phoneFocused ? colors.ink : colors.hairline,
            }}
          >
            <TextInput
              value={phone}
              onChangeText={(text) => setPhone(text.replace(/\D/g, ''))}
              onFocus={() => setPhoneFocused(true)}
              onBlur={() => setPhoneFocused(false)}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              placeholder="e.g. 08012345678"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Your phone number"
              autoFocus
              underlineColorAndroid="transparent"
              className="w-full bg-transparent text-xl text-ink"
              style={{
                paddingVertical: 8,
                margin: 0,
                borderWidth: 0,
                backgroundColor: 'transparent',
                includeFontPadding: false,
              }}
            />
          </View>
        ) : (
          <View className="mt-8">
            <OtpDashedInput value={otp} onChange={setOtp} autoFocus />

            <Text className="text-sm leading-5 text-muted">
              Didn&apos;t get a code?{' '}
              {resendSecondsLeft > 0 ? (
                <Text className="font-semibold text-muted">Resend in {resendSecondsLeft}s</Text>
              ) : (
                <Text
                  className="font-semibold text-brand"
                  onPress={() => !resend.isPending && resend.mutate()}
                  accessibilityRole="button"
                >
                  Resend
                </Text>
              )}
            </Text>
          </View>
        )}

        {mutationError ? (
          <View className="mt-3">
            <InlineError error={mutationError} />
          </View>
        ) : null}
        {resend.isError ? (
          <View className="mt-3">
            <InlineError error={resend.error} />
          </View>
        ) : null}

        <View className="flex-1" />

        <AuthFooterButton
          label={otpSent ? 'Verify' : 'Next'}
          onPress={primaryAction}
          disabled={primaryDisabled}
          loading={primaryLoading}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}
