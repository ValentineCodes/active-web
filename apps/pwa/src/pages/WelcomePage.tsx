import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';

export function WelcomePage() {
  const navigate = useNavigate();
  return (
    <Screen className="min-h-[100dvh] px-6 pb-10 pt-12">
      <div className="flex min-h-full flex-1 flex-col justify-between">
        <WelcomeHero />

        <WelcomeFooter onContinue={() => navigate('/sign-in')} />
      </div>
    </Screen>
  );
}

function WelcomeHero() {
  return (
    <div className="mt-16 flex flex-col items-center text-center">
      <img src="/icons/icon-512.png" alt="Active" className="shadow-card mb-6 h-28 w-28 rounded-3xl" />
      <h1 className="text-3xl font-bold text-ink">Welcome to Active</h1>
      <p className="mt-4 text-base leading-6 text-muted">
        Need something? Ask.
        <br />
        Can help? Respond.
      </p>
    </div>
  );
}

function WelcomeFooter({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-center text-sm leading-6 text-muted">
        Read our Privacy Policy and Terms of Service before you continue.
      </p>
      <Button label="Agree and continue" onClick={onContinue} size="lg" />
    </div>
  );
}
