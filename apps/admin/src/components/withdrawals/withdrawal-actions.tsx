'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

type Props = {
  withdrawalId: string;
  status: string;
};

function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `wd-admin-${Date.now()}`;
}

export function WithdrawalActions({ withdrawalId, status }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [transferRef, setTransferRef] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const post = async (path: string, body: Record<string, unknown>) => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, idempotencyKey: newIdempotencyKey() }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Action failed');
      }
      setConfirmAction(null);
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const runConfirmed = () => {
    if (!confirmAction) return;
    const trimmedReason = reason.trim();
    if ((confirmAction === 'reject' || confirmAction === 'fail') && trimmedReason.length < 3) {
      setError('Enter a user-facing reason (at least 3 characters).');
      return;
    }
    if (confirmAction === 'begin') {
      void post(`/api/admin/withdrawals/${withdrawalId}/begin-processing`, { adminNotes });
      return;
    }
    if (confirmAction === 'reject') {
      void post(`/api/admin/withdrawals/${withdrawalId}/reject`, {
        reason: trimmedReason,
        adminNotes,
      });
      return;
    }
    if (confirmAction === 'complete') {
      void post(`/api/admin/withdrawals/${withdrawalId}/complete`, {
        bankTransferReference: transferRef,
        adminNotes,
      });
      return;
    }
    if (confirmAction === 'fail') {
      void post(`/api/admin/withdrawals/${withdrawalId}/fail`, {
        reason: trimmedReason,
        adminNotes,
      });
    }
  };

  if (status === 'completed' || status === 'rejected' || status === 'failed') {
    return (
      <p className="text-sm text-muted">
        This withdrawal is in a terminal state. No further actions are available.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Send the bank transfer outside Active first. Only mark completed after you independently
        confirm the payment succeeded.
      </p>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <label className="block text-xs text-muted">
        Internal notes (optional)
        <textarea
          value={adminNotes}
          onChange={(event) => setAdminNotes(event.target.value)}
          className="bg-canvas mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
          rows={2}
        />
      </label>

      {status === 'pending' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            loading={loading && confirmAction === 'begin'}
            onClick={() => setConfirmAction('begin')}
          >
            Approve for processing
          </Button>
          <Button variant="secondary" onClick={() => setConfirmAction('reject')}>
            Reject
          </Button>
        </div>
      ) : null}

      {status === 'processing' ? (
        <div className="space-y-3">
          <label className="block text-xs text-muted">
            Bank transfer reference (optional)
            <input
              value={transferRef}
              onChange={(event) => setTransferRef(event.target.value)}
              className="bg-canvas mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setConfirmAction('complete')}>
              Mark completed
            </Button>
            <Button variant="secondary" onClick={() => setConfirmAction('fail')}>
              Mark failed
            </Button>
          </div>
        </div>
      ) : null}

      {confirmAction ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Confirm action</p>
          {confirmAction === 'reject' || confirmAction === 'fail' ? (
            <label className="mt-2 block text-xs">
              User-facing reason (required)
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-ink"
                rows={3}
              />
            </label>
          ) : (
            <p className="mt-2">
              {confirmAction === 'begin'
                ? 'Approve this withdrawal for manual payout? Funds were already reserved when the user submitted the request.'
                : 'Confirm that the external bank transfer succeeded and finalize this withdrawal?'}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" loading={loading} onClick={runConfirmed}>
              Confirm
            </Button>
            <Button variant="secondary" disabled={loading} onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
