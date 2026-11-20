'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from '@/lib/navigation';

import { InsufficientWalletSheet } from '@/components/request-flow/InsufficientWalletSheet';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { MoneyAmountInput } from '@/components/ui/MoneyAmountInput';
import { MARKET } from '@/config';
import { useContributeToProject } from '@/features/projects/project-api';
import { useMyWallet } from '@/features/wallet/api';
import { walletLockShortfallMajor, walletTopUpPath } from '@/features/wallet/top-up';
import { formatMoney } from '@/lib/format';
import { isInsufficientWalletBalanceError, toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';

const INSUFFICIENT_WALLET_MESSAGE =
  'You don\u2019t have enough available money in your wallet. Add money, then try contributing again.';

type InsufficientWalletPrompt = {
  message: string;
  requiredLockMajor: number;
};

type Props = {
  open: boolean;
  projectId: string;
  projectTitle: string;
  minContributionMajor: number;
  onClose: () => void;
};

export function ProjectContributeModal({
  open,
  projectId,
  projectTitle,
  minContributionMajor,
  onClose,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [insufficientWalletPrompt, setInsufficientWalletPrompt] =
    useState<InsufficientWalletPrompt | null>(null);
  const contribute = useContributeToProject();
  const wallet = useMyWallet();

  useEffect(() => {
    if (!open) {
      setAmount('');
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  const openInsufficientWalletFlow = useCallback(
    (requiredLockMajor: number, message: string) => {
      onClose();
      setInsufficientWalletPrompt({ message, requiredLockMajor });
    },
    [onClose],
  );

  const submit = useCallback(() => {
    const major = Number(amount.replace(/[^\d.]/g, ''));
    if (!major || Number.isNaN(major)) {
      showAppToast('Enter a contribution amount', 'warning');
      return;
    }
    if (major < minContributionMajor) {
      showAppToast(
        `Minimum contribution is ${formatMoney(minContributionMajor, MARKET.currency)}.`,
        'warning',
      );
      return;
    }

    if (wallet.isSuccess) {
      const availableMajor = wallet.data.available;
      if (walletLockShortfallMajor(major, availableMajor) > 0) {
        openInsufficientWalletFlow(major, INSUFFICIENT_WALLET_MESSAGE);
        return;
      }
    }

    contribute.mutate(
      { projectId, amountMajor: major },
      {
        onSuccess: () => {
          setAmount('');
          onClose();
          showAppToast('Contribution recorded', { type: 'success' });
        },
        onError: (error) => {
          if (isInsufficientWalletBalanceError(error)) {
            openInsufficientWalletFlow(major, toUserMessage(error));
            return;
          }
          showAppToast(toUserMessage(error), 'warning');
        },
      },
    );
  }, [
    amount,
    contribute,
    minContributionMajor,
    onClose,
    openInsufficientWalletFlow,
    projectId,
    wallet.data,
    wallet.isSuccess,
  ]);

  const handleDismiss = useCallback(() => {
    if (contribute.isPending) return;
    onClose();
  }, [contribute.isPending, onClose]);

  return (
    <>
      <BottomSheet
        open={open}
        onClose={handleDismiss}
        dismissible={!contribute.isPending}
        className="max-h-[70dvh]"
        footer={
          <Button
            label={contribute.isPending ? 'Contributing…' : 'Contribute'}
            variant="active"
            size="lg"
            corner="2xl"
            loading={contribute.isPending}
            disabled={contribute.isPending}
            onClick={submit}
          />
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold text-ink">Contribute</h2>
            <p className="text-base text-muted">
              Add to the shared pool for {projectTitle.trim() || 'this project'}.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-ink">Amount</p>
            <div className="rounded-2xl bg-surface px-5 py-4">
              <MoneyAmountInput
                inputRef={inputRef}
                accessibilityLabel="Contribution amount"
                value={amount}
                onChangeText={(text) => setAmount(text.replace(/[^\d]/g, ''))}
              />
            </div>
            <p className="text-sm text-muted">
              Minimum {formatMoney(minContributionMajor, MARKET.currency)}
            </p>
          </div>

          {contribute.isError && !isInsufficientWalletBalanceError(contribute.error) ? (
            <p className="text-sm text-danger">{toUserMessage(contribute.error)}</p>
          ) : null}
        </div>
      </BottomSheet>

      <InsufficientWalletSheet
        open={insufficientWalletPrompt !== null}
        message={insufficientWalletPrompt?.message ?? ''}
        onClose={() => setInsufficientWalletPrompt(null)}
        onAddMoney={() => {
          const prompt = insufficientWalletPrompt;
          if (!prompt) return;
          setInsufficientWalletPrompt(null);
          router.push(
            walletTopUpPath({
              returnTo: `/project/${projectId}`,
              requiredLockMajor: prompt.requiredLockMajor,
              availableMajor: wallet.data?.available ?? 0,
            }),
          );
        }}
      />
    </>
  );
}