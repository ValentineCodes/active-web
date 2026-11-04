'use client';

import { format } from 'date-fns';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

export type UserIdentitySummary = {
  ninSubmitted: boolean;
  submittedAt: string | null;
  ninMasked: string | null;
};

type Props = {
  userId: string;
  identity: UserIdentitySummary;
  canRevealNin: boolean;
};

export function UserIdentitySection({ userId, identity, canRevealNin }: Props) {
  const [fullNin, setFullNin] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const reveal = async () => {
    setError(null);
    setLoading(true);
    try {
      const idempotencyKey = globalThis.crypto?.randomUUID?.() ?? `nin-reveal-${Date.now()}`;
      const response = await fetch(`/api/admin/users/${userId}/reveal-nin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim(), idempotencyKey }),
      });
      const payload = (await response.json()) as {
        error?: string;
        data?: { nin?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not reveal NIN');
      }
      const nin = payload.data?.nin;
      if (!nin) {
        throw new Error('Unexpected response');
      }
      setFullNin(nin);
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : 'Could not reveal NIN');
    } finally {
      setLoading(false);
    }
  };

  const copyNin = async () => {
    if (!fullNin) return;
    try {
      await navigator.clipboard.writeText(fullNin);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard');
    }
  };

  return (
    <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
      <h3 className="text-sm font-semibold text-ink">Identity (NIN)</h3>
      <p className="mt-1 text-xs text-muted">
        Users must submit a National Identification Number before withdrawals are accepted. Full NIN
        is shown only after an audited reveal for compliance or payout verification.
      </p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">NIN on file</dt>
          <dd>{identity.ninSubmitted ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt className="text-muted">Submitted</dt>
          <dd>
            {identity.submittedAt
              ? format(new Date(identity.submittedAt), 'PPpp')
              : identity.ninSubmitted
                ? '—'
                : 'Not submitted'}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted">NIN</dt>
          <dd className="font-mono text-sm">{fullNin ?? identity.ninMasked ?? '—'}</dd>
        </div>
      </dl>

      {identity.ninSubmitted && canRevealNin && !fullNin ? (
        <div className="mt-4 space-y-2">
          <label className="block text-xs font-medium text-muted" htmlFor="nin-reveal-reason">
            Reason for access
          </label>
          <textarea
            id="nin-reveal-reason"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Withdrawal payout verification for pending transfer"
          />
          <Button
            variant="secondary"
            loading={loading}
            disabled={reason.trim().length < 10}
            onClick={() => void reveal()}
          >
            Reveal full NIN
          </Button>
        </div>
      ) : null}

      {fullNin ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => void copyNin()}>
            {copied ? 'Copied' : 'Copy NIN'}
          </Button>
          <p className="text-xs text-muted">
            This access is recorded in the audit trail (NIN value is not stored in logs).
          </p>
        </div>
      ) : null}

      {identity.ninSubmitted && !canRevealNin ? (
        <p className="mt-3 text-xs text-subtle">
          Your role can view submission status but cannot reveal the full NIN. Contact a Super Admin
          or Finance Admin if you need audited access.
        </p>
      ) : null}

      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
