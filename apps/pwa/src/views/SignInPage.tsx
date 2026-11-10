'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ActiveBarButton } from '@/components/ui/ActiveBarButton';
import { OtpInput } from '@/components/auth/OtpInput';
import { PhoneUnderlineField } from '@/components/auth/PhoneUnderlineField';
import { KeyboardStickyFooter } from '@/components/layout/KeyboardStickyFooter';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeading } from '@/components/ui/ScreenHeading';
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
    if (process.env.NODE_ENV === 'production') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('otp') === '1') {
      setOtpSent(true);
      setPhone('08012345678');
    }
  }, []);

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

  const handleChangeNumber = () => {
    setOtpSent(false);
    setOtp('');
    setResendSecondsLeft(0);
    sendCode.reset();
    verify.reset();
    resend.reset();
  };

  const handleWhatsMyNumber = () => {
    window.alert("You can find your number in your device's Settings under Phone or About.");
  };

  const primaryLoading = otpSent ? verify.isPending : sendCode.isPending;
  const primaryDisabled = otpSent ? !isOtpComplete : !canSend;
  const mutationError = otpSent ? verify.error : sendCode.error;

  const primaryAction = () => {
    if (otpSent) verify.mutate();
    else sendCode.mutate();
  };

  return (
    <Screen className="min-h-[100dvh]">
      <KeyboardStickyFooter
        footer={
          <div className="px-6 pb-8">
            <ActiveBarButton
              label={otpSent ? 'Verify' : 'Next'}
              onClick={primaryAction}
              disabled={primaryDisabled}
              loading={primaryLoading}
            />
          </div>
        }
      >
        <div className="grow px-6 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <ScreenHeading
            title={otpSent ? 'Verify your number' : 'Enter your phone number'}
            onBack={() => router.push('/welcome')}
          />

          <p className="mt-3 text-sm leading-6 text-muted">
            {otpSent ? (
              <>
                Enter the {CODE_LENGTH}-digit code we sent to{' '}
                <span className="font-semibold text-ink">{displayNumber}</span>.{' '}
                <button type="button" className="font-semibold text-brand" onClick={handleChangeNumber}>
                  Change number
                </button>
              </>
            ) : (
              <>
                Active will verify your phone number. Carrier charges may apply.{' '}
                <button type="button" className="font-semibold text-brand" onClick={handleWhatsMyNumber}>
                  What&apos;s my number?
                </button>
              </>
            )}
          </p>

          {!otpSent ? (
            <PhoneUnderlineField value={phone} onChange={setPhone} autoFocus />
          ) : (
            <div className="mt-8">
              <OtpInput value={otp} onChange={setOtp} autoFocus />

              <p className="text-sm leading-5 text-muted">
                Didn&apos;t get a code?{' '}
                {resendSecondsLeft > 0 ? (
                  <span className="font-semibold text-muted">Resend in {resendSecondsLeft}s</span>
                ) : (
                  <button
                    type="button"
                    className={resend.isPending ? 'font-semibold text-muted' : 'font-semibold text-brand'}
                    disabled={resend.isPending}
                    onClick={() => resend.mutate()}
                  >
                    {resend.isPending ? 'Sending…' : 'Resend'}
                  </button>
                )}
              </p>
            </div>
          )}

          {mutationError ? (
            <div className="mt-3">
              <InlineError error={mutationError} />
            </div>
          ) : null}
          {resend.isError ? (
            <div className="mt-3">
              <InlineError error={resend.error} />
            </div>
          ) : null}
        </div>
      </KeyboardStickyFooter>
    </Screen>
  );
}
