'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

type Action = {
  action: string;
  label: string;
  requires_reason?: boolean;
  requires_confirmation?: boolean;
};

type Props = {
  requestId: string;
  actions: Action[];
};

export function IssueRecoveryActions({ requestId, actions }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (actions.length === 0) return null;

  const run = async (action: string) => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/admin/operational-issues/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          requestId,
          reason: reason.trim(),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = (await response.json()) as { error?: string; applied?: boolean };
      if (!response.ok) throw new Error(payload.error ?? 'Recovery failed');
      setReason('');
      setConfirmed(false);
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Recovery failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-surface p-3 text-sm">
      <p className="font-medium text-ink">Authorized recovery</p>
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason for intervention (min 10 characters)"
        className="mt-2 min-h-16 w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      {actions.some((item) => item.requires_confirmation) ? (
        <label className="mt-2 flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I confirm this uses the existing auto-completion backend path and may release payment per policy.
        </label>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {actions.map((item) => (
          <Button
            key={item.action}
            variant="secondary"
            loading={loading}
            disabled={reason.trim().length < 10 || (item.requires_confirmation && !confirmed)}
            onClick={() => run(item.action)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {error ? <p className="mt-2 text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
