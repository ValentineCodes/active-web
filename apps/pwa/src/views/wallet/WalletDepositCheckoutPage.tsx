'use client';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { WalletDepositSettlement } from '@/components/wallet/WalletDepositSettlement';

export function WalletDepositCheckoutPage() {
  return (
    <FlowScreen title="Payment" backTo="/wallet" bodyClassName="flex flex-col gap-3">
      <WalletDepositSettlement />
    </FlowScreen>
  );
}
