'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { OtpInput } from '@/components/auth/OtpInput';
import { FlowScreen } from '@/components/layout/FlowScreen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { InlineError } from '@/components/ui/StateView';
import { MARKET } from '@/config/market';
import { isPlausiblePhone, sendPhoneOtp, toE164, verifyPhoneOtp } from '@/features/auth/api';
import { profileQueryOptions } from '@/features/profile/api';
import { supabase } from '@/lib/supabase/client';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 30;

export function SignInPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);

  const sendCode = useMutation({
    mutationFn: () => sendPhoneOtp(phone),
    onSuccess: () => {
      setOtpSent(true);
      setResendSecondsLeft(RESEND_COOLDOWN_SEC);
    },
  });

  const verify = useMutation({
    mutationFn: async () => {
      await verifyPhoneOtp(phone, otp);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) throw new Error('Sign-in did not complete. Try again.');
      return queryClient.fetchQuery(profileQueryOptions(userId));
    },
    onSuccess: (profile) => {
      router.replace(profile.display_name ? '/home' : '/onboarding');
    },
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

  const canSend = isPlausiblePhone(phone);
  const isOtpComplete = otp.length === CODE_LENGTH;
  const displayNumber = phone.replace(/\D/g, '') ? toE164(phone) : MARKET.dialCode;

  const resetNumber = () => {
    setOtpSent(false);
    setOtp('');
    setResendSecondsLeft(0);
    sendCode.reset();
    verify.reset();
    resend.reset();
  };

  const primaryLoading = otpSent ? verify.isPending : sendCode.isPending;
  const primaryDisabled = otpSent ? !isOtpComplete : !canSend;
  const mutationError = otpSent ? verify.error : sendCode.error;

  return (
    <FlowScreen
      title={otpSent ? 'Verify your number' : 'Sign in'}
      backTo="/welcome"
      bodyClassName="flex flex-col gap-6 pb-10"
    >
      <p className="text-base leading-6 text-muted">
        {otpSent ? (
          <>
            Enter the {CODE_LENGTH}-digit code we sent to{' '}
            <span className="font-semibold text-ink">{displayNumber}</span>.{' '}
            <button type="button" className="font-semibold text-brand" onClick={resetNumber}>
              Change number
            </button>
          </>
        ) : (
          <>Active will verify your phone number. Carrier charges may apply.</>
        )}
      </p>

      {!otpSent ? (
        <TextField
          label="Phone number"
          value={phone}
          onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
          inputMode="tel"
          autoComplete="tel"
          placeholder="e.g. 08012345678"
        />
      ) : (
        <>
          <OtpInput value={otp} onChange={setOtp} />
          <p className="text-sm text-muted">
            Didn&apos;t get a code?{' '}
            {resendSecondsLeft > 0 ? (
              <span className="font-semibold">Resend in {resendSecondsLeft}s</span>
            ) : (
              <button
                type="button"
                className="font-semibold text-brand"
                disabled={resend.isPending}
                onClick={() => resend.mutate()}
              >
                {resend.isPending ? 'Sending…' : 'Resend'}
              </button>
            )}
          </p>
        </>
      )}

      {mutationError ? <InlineError error={mutationError} /> : null}
      {resend.isError ? <InlineError error={resend.error} /> : null}

      <Button
        label={otpSent ? 'Verify' : 'Next'}
        loading={primaryLoading}
        disabled={primaryDisabled}
        size="lg"
        onClick={() => {
          if (otpSent) verify.mutate();
          else sendCode.mutate();
        }}
      />
    </FlowScreen>
  );
}
