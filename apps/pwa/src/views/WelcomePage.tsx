'use client';

import { useRouter } from 'next/navigation';

import { ActiveBarButton } from '@/components/ui/ActiveBarButton';
import { Screen } from '@/components/ui/Screen';

export function WelcomePage() {
  const router = useRouter();
  return (
    <Screen className="min-h-[100dvh] px-8 pb-10 pt-12">
      <div className="flex min-h-full flex-1 flex-col justify-between">
        <WelcomeHero />

        <WelcomeFooter onContinue={() => router.push('/sign-in')} />
      </div>
    </Screen>
  );
}

function WelcomeHero() {
  return (
    <div className="mt-20 flex flex-col items-center text-center">
      <img
        src="/images/logo.png"
        alt="Active"
        width={160}
        height={160}
        className="mb-4 h-40 w-40 object-contain"
      />
      <h1 className="text-3xl font-bold text-ink">Welcome to Active</h1>
      <p className="mt-4 text-sm leading-6 text-muted">
        If you can pay for it, someone can do it.
      </p>
    </div>
  );
}

function WelcomeFooter({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-center text-sm leading-6 text-muted">
        Read our{' '}
        <span className="font-semibold text-brand underline">Privacy Policy</span>. Tap &ldquo;Agree and continue&rdquo; to
        accept the <span className="font-semibold text-brand underline">Terms of Service</span>.
      </p>
      <ActiveBarButton label="Agree and continue" onClick={onContinue} showChevron />
    </div>
  );
}
