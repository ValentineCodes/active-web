'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { InlineError } from '@/components/ui/StateView';
import { MARKET } from '@/config/index';
import { submitNin, submitNinErrorMessage, useMyIdentityStatus } from '@/features/identity/api';
import { useMyBankAccounts } from '@/features/profile/bank-accounts-api';
import { invalidateWalletQueries, useMyWallet } from '@/features/wallet/api';
import { queryClient } from '@/lib/query/client';
import { formatMoney } from '@/lib/format';
import { requestWalletWithdrawal } from '@/features/wallet/withdraw-api';
import { withdrawErrorMessage } from '@/features/wallet/withdraw-errors';
import {
  clearPendingWithdrawSubmission,
  readPendingWithdrawSubmission,
  setPendingWithdrawSubmission,
} from '@/features/wallet/withdraw-pending';
import { readWithdrawDraftFromSearch } from '@/features/wallet/withdraw-navigation';
import {
  resolveWithdrawAmountLimits,
  validateWithdrawAmountMajor,
} from '@/features/wallet/withdraw-limits';
import { usePublicWithdrawalPolicy } from '@/features/wallet/withdraw-policy-api';
import { resolveWithdrawalAfterNetworkError } from '@/features/wallet/withdrawals-api';
import {
  isIdentityVerificationWithdrawalError,
  shouldCollectNinBeforeWithdrawal,
} from '@/features/wallet/withdraw-nin-flow';
import { maskBankAccountNumber } from '@/features/profile/bank-account-display';

function createIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `wd-${Date.now()}`;
}

export function WalletWithdrawReviewPage() {
  const router = useRouter();
  const search = useSearchParams();
  const draft = readWithdrawDraftFromSearch(search);
  const amountMajor = Number(draft.amount);
  const wallet = useMyWallet();
  const bankAccounts = useMyBankAccounts();
  const policy = usePublicWithdrawalPolicy();
  const identity = useMyIdentityStatus();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nin, setNin] = useState('');
  const [ninConsent, setNinConsent] = useState(false);
  const idempotencyRef = useRef<string | null>(null);

  const account = (bankAccounts.data ?? []).find((r) => r.bank_account_id === draft.bankAccountId);
  const limits = resolveWithdrawAmountLimits(policy.data);
  const available = wallet.data?.available ?? 0;
  const validationError = wallet.data
    ? validateWithdrawAmountMajor(amountMajor, available, limits)
    : 'Loading wallet…';

  const needsNin = shouldCollectNinBeforeWithdrawal(
    policy.data?.requireIdentityVerification,
    identity.data?.ninSubmitted,
  );

  const goToSuccess = useCallback((withdrawalId: string, message: string) => {
    clearPendingWithdrawSubmission();
    idempotencyRef.current = null;
    const params = new URLSearchParams({ withdrawalId, message });
    router.replace(`/wallet/withdraw/result?${params.toString()}`);
  }, [router]);

  useEffect(() => {
    if (!account || !draft.amount || validationError) return;
    const pending = readPendingWithdrawSubmission();
    if (!pending || pending.amountMajor !== amountMajor || pending.bankAccountId !== draft.bankAccountId) {
      return;
    }
    idempotencyRef.current = pending.idempotencyKey;
    void resolveWithdrawalAfterNetworkError(pending, account.bank_name, account.account_name).then(
      (resolved) => {
        if (resolved) {
          goToSuccess(resolved.withdrawalId, 'Your withdrawal request was already submitted.');
        }
      },
    );
  }, [account, amountMajor, draft.amount, draft.bankAccountId, goToSuccess, validationError]);

  const submitWithdrawal = async () => {
    if (!draft.bankAccountId || validationError) return;
    const key = idempotencyRef.current ?? createIdempotencyKey();
    idempotencyRef.current = key;
    setPendingWithdrawSubmission({
      idempotencyKey: key,
      amountMajor,
      bankAccountId: draft.bankAccountId,
      startedAt: new Date().toISOString(),
    });
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestWalletWithdrawal({
        amountMajor,
        bankAccountId: draft.bankAccountId,
        idempotencyKey: key,
      });
      clearPendingWithdrawSubmission();
      await invalidateWalletQueries(queryClient);
      const withdrawalId = result.withdrawal_id;
      if (!withdrawalId) throw new Error('Unexpected withdrawal response');
      goToSuccess(withdrawalId, result.message);
    } catch (err) {
      if (isIdentityVerificationWithdrawalError(err) && needsNin) {
        setError('Identity verification is required before withdrawing.');
      } else {
        setError(withdrawErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitNinAndWithdraw = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await submitNin({ nin: nin.replace(/\D/g, ''), consent: ninConsent });
      await identity.refetch();
      await submitWithdrawal();
    } catch (err) {
      setError(submitNinErrorMessage(err));
      setSubmitting(false);
    }
  };

  const withdrawBack = `/wallet/withdraw?amount=${amountMajor}&bankAccountId=${draft.bankAccountId}`;

  if (!account || validationError) {
    return (
      <FlowScreen title="Review withdrawal" backTo="/wallet/withdraw">
        <InlineError message={typeof validationError === 'string' ? validationError : 'Invalid withdrawal.'} />
      </FlowScreen>
    );
  }

  return (
    <FlowScreen title="Review withdrawal" backTo={withdrawBack} bodyClassName="flex flex-col gap-4">
      <Card tone="surface" className="!p-5">
        <p className="text-sm text-muted">Withdraw</p>
        <p className="text-2xl font-bold text-ink">{formatMoney(amountMajor, wallet.data?.currency ?? MARKET.currency)}</p>
        <p className="mt-3 text-sm text-ink">
          {account.bank_name} · {maskBankAccountNumber(account.account_number)}
        </p>
        <p className="text-xs text-subtle">{account.account_name}</p>
      </Card>

      {needsNin ? (
        <Card tone="surface" className="shadow-card !p-4">
          <p className="text-sm font-semibold text-ink">NIN required</p>
          <TextField
            label="National ID (NIN)"
            inputMode="numeric"
            value={nin}
            maxLength={11}
            onChange={(e) => setNin(e.target.value.replace(/\D/g, '').slice(0, 11))}
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={ninConsent} onChange={(e) => setNinConsent(e.target.checked)} />
            I consent to identity verification for withdrawals.
          </label>
        </Card>
      ) : null}

      {error ? <InlineError message={error} /> : null}

      <Button
        label="Confirm withdrawal"
        loading={submitting}
        onClick={() => void (needsNin ? submitNinAndWithdraw() : submitWithdrawal())}
      />
    </FlowScreen>
  );
}
