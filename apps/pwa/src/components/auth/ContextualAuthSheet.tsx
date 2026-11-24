'use client';

import { ActiveBarButton } from '@/components/ui/ActiveBarButton';
import { ActiveLogo } from '@/components/ui/ActiveLogo';
import { VaulSheet } from '@/components/ui/VaulSheet';
import { IconButton } from '@/components/ui/IconButton';

const HEADLINE = 'You need an Active account to continue';
const SIGN_UP_CTA = 'Sign up with phone number';

type Props = {
  open: boolean;
  contextHint: string | null;
  logInLabel: string;
  onClose: () => void;
  onSignUp: () => void;
  onLogIn: () => void;
};

export function ContextualAuthSheet({
  open,
  contextHint,
  logInLabel,
  onClose,
  onSignUp,
  onLogIn,
}: Props) {
  return (
    <VaulSheet
      open={open}
      onClose={onClose}
      elevated
      footer={
        <p className="text-center text-sm leading-5 text-muted">
          Already have an account?{' '}
          <button type="button" className="font-semibold text-brand active:opacity-80" onClick={onLogIn}>
            {logInLabel}
          </button>
        </p>
      }
    >
      <div className="relative flex flex-col items-center px-1 pb-2 pt-1 text-center">
        <div className="absolute right-0 top-0">
          <IconButton icon="close" accessibilityLabel="Close" onClick={onClose} size={36} iconSize={22} />
        </div>

        <ActiveLogo size={80} className="mb-5 h-20 w-20" />

        <h2 className="max-w-sm text-2xl font-bold leading-8 tracking-tight text-ink">{HEADLINE}</h2>

        {contextHint ? (
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted">{contextHint}</p>
        ) : null}

        <div className="mt-8 w-full max-w-sm">
          <ActiveBarButton label={SIGN_UP_CTA} onClick={onSignUp} />
        </div>

        <p className="mx-auto mt-5 max-w-xs text-center text-xs leading-5 text-muted">
          By signing up, you confirm that you agree to our{' '}
          <span className="whitespace-nowrap font-semibold text-brand">Terms of Use</span> and have read and understood
          our <span className="whitespace-nowrap font-semibold text-brand">Privacy Policy</span>.
        </p>
      </div>
    </VaulSheet>
  );
}