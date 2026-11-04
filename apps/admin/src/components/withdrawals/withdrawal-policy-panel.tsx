'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { AdminWithdrawalPolicyResponse } from '@/lib/admin/withdrawal-policy-types';

function koboToNairaInput(kobo: number): string {
  return String(Math.round(kobo / 100));
}

function nairaInputToKobo(value: string): number {
  const major = Number(value.replace(/[^\d]/g, ''));
  if (!Number.isFinite(major) || major <= 0) return 0;
  return major * 100;
}

function createIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `policy-${Date.now()}`;
}

type Props = {
  initial: AdminWithdrawalPolicyResponse;
};

export function WithdrawalPolicyPanel({ initial }: Props) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [minNaira, setMinNaira] = useState(koboToNairaInput(initial.policy.minAmountKobo));
  const [maxNaira, setMaxNaira] = useState(koboToNairaInput(initial.policy.maxAmountKobo));
  const [dailyNaira, setDailyNaira] = useState(koboToNairaInput(initial.policy.maxDailyAmountKobo));
  const [withdrawalsEnabled, setWithdrawalsEnabled] = useState(initial.policy.withdrawalsEnabled);
  const [requireAdminReview, setRequireAdminReview] = useState(initial.policy.requireAdminReview);
  const [requireIdentity, setRequireIdentity] = useState(
    initial.policy.requireIdentityVerificationForWithdrawal,
  );
  const [devBypass, setDevBypass] = useState(
    initial.policy.allowWithdrawWithoutIdentityInDevelopment,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setState(initial);
    setMinNaira(koboToNairaInput(initial.policy.minAmountKobo));
    setMaxNaira(koboToNairaInput(initial.policy.maxAmountKobo));
    setDailyNaira(koboToNairaInput(initial.policy.maxDailyAmountKobo));
    setWithdrawalsEnabled(initial.policy.withdrawalsEnabled);
    setRequireAdminReview(initial.policy.requireAdminReview);
    setRequireIdentity(initial.policy.requireIdentityVerificationForWithdrawal);
    setDevBypass(initial.policy.allowWithdrawWithoutIdentityInDevelopment);
  }, [initial]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/withdrawals/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minAmountKobo: nairaInputToKobo(minNaira),
          maxAmountKobo: nairaInputToKobo(maxNaira),
          maxDailyAmountKobo: nairaInputToKobo(dailyNaira),
          withdrawalsEnabled,
          requireAdminReview,
          requireIdentityVerificationForWithdrawal: requireIdentity,
          allowWithdrawWithoutIdentityInDevelopment: devBypass,
          idempotencyKey: createIdempotencyKey(),
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? 'Could not save withdrawal policy');
      }
      router.refresh();
      setMessage('Withdrawal policy saved. Existing requests are unchanged.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save withdrawal policy');
    } finally {
      setSaving(false);
    }
  }, [
    dailyNaira,
    devBypass,
    maxNaira,
    minNaira,
    requireAdminReview,
    requireIdentity,
    router,
    withdrawalsEnabled,
  ]);

  const localOnly = state.deploymentEnvironment === 'local';

  return (
    <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
      <h3 className="text-lg font-semibold text-ink">Withdrawal policy</h3>
      <p className="mt-1 text-sm text-muted">
        Limits are enforced in kobo on the server. Changes apply to new requests only.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium text-ink">Minimum (NGN)</span>
          <input
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2"
            inputMode="numeric"
            value={minNaira}
            onChange={(e) => setMinNaira(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Maximum per withdrawal (NGN)</span>
          <input
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2"
            inputMode="numeric"
            value={maxNaira}
            onChange={(e) => setMaxNaira(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Daily limit per user (NGN)</span>
          <input
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2"
            inputMode="numeric"
            value={dailyNaira}
            onChange={(e) => setDailyNaira(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={withdrawalsEnabled}
            onChange={(e) => setWithdrawalsEnabled(e.target.checked)}
          />
          <span>Withdrawals enabled</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={requireAdminReview}
            onChange={(e) => setRequireAdminReview(e.target.checked)}
          />
          <span>New withdrawals require admin review (pending before processing)</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={requireIdentity}
            onChange={(e) => setRequireIdentity(e.target.checked)}
          />
          <span>Require provider identity verification before withdrawal (production)</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={devBypass}
            disabled={!localOnly}
            onChange={(e) => setDevBypass(e.target.checked)}
          />
          <span>
            Allow withdrawals without identity on local deployment only
            {localOnly ? '' : ' (disabled — not a local environment)'}
          </span>
        </label>
      </div>

      {state.identityDevelopmentBypassActive ? (
        <p className="mt-3 text-xs text-amber-700">
          Development identity bypass is active for this environment. No fake verification records
          are created.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-green-700">{message}</p> : null}

      <div className="mt-4">
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          Save withdrawal policy
        </Button>
      </div>
    </section>
  );
}
