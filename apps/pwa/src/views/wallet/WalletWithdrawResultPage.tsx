'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { clearWithdrawNavigationState } from '@/features/wallet/withdraw-navigation';

export function WalletWithdrawResultPage() {
  const router = useRouter();
  const search = useSearchParams();
  const message = search.get('message') ?? 'Withdrawal submitted.';
  const withdrawalId = search.get('withdrawalId');

  const done = () => {
    clearWithdrawNavigationState();
  };

  return (
    <FlowScreen title="Withdrawal" backTo="/wallet" bodyClassName="flex flex-col gap-4">
      <Card tone="surface" className="!items-center !p-6 text-center">
        <h2 className="text-base font-semibold text-ink">Withdrawal requested</h2>
        <p className="mt-2 text-sm text-muted">{message}</p>
        {withdrawalId ? <p className="mt-2 text-xs text-subtle">Reference: {withdrawalId}</p> : null}
      </Card>
      <Button
        label="Back to wallet"
        onClick={() => {
          done();
          router.push('/wallet');
        }}
      />
      {withdrawalId ? (
        <Button
          label="View status"
          variant="ghost"
          onClick={() => {
            done();
            router.push(`/wallet/withdrawal/${withdrawalId}`);
          }}
        />
      ) : null}
    </FlowScreen>
  );
}
