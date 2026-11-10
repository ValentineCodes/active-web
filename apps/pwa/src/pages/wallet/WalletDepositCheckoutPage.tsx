import { Link } from 'react-router-dom';

import { WalletDepositSettlement } from '@/components/wallet/WalletDepositSettlement';

export function WalletDepositCheckoutPage() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-3 bg-canvas px-5 py-2">
      <header className="pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link to="/wallet" className="text-sm font-semibold text-brand">
          Wallet
        </Link>
      </header>
      <WalletDepositSettlement />
    </div>
  );
}
