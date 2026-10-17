'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

type Props = {
  userId: string;
  isRestricted: boolean;
};

export function UserAdminActions({ userId, isRestricted }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runAction = async (path: string, body: Record<string, string>) => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? 'Action failed');
      }
      setReason('');
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-elevated p-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">Account restrictions</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Suspension blocks new requests and new offers only. Existing engagements, chat,
          completion, reports, and wallet access continue unchanged.
        </p>
      </div>
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (minimum 10 characters)"
        className="min-h-20 w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      {isRestricted ? (
        <Button
          variant="secondary"
          loading={loading}
          onClick={() =>
            runAction(`/api/admin/users/${userId}/reinstate`, {
              reason,
              idempotencyKey: crypto.randomUUID(),
            })
          }
        >
          Reinstate account
        </Button>
      ) : (
        <Button
          variant="danger"
          loading={loading}
          onClick={() =>
            runAction(`/api/admin/users/${userId}/suspend`, {
              reason,
              idempotencyKey: crypto.randomUUID(),
            })
          }
        >
          Suspend new marketplace activity
        </Button>
      )}

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-ink">Internal note</h3>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add an internal administrative note"
          className="mt-2 min-h-20 w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
        <Button
          className="mt-2"
          variant="secondary"
          loading={loading}
          onClick={() =>
            runAction(`/api/admin/users/${userId}/notes`, { body: note }).then(() => setNote(''))
          }
        >
          Save note
        </Button>
      </div>

      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
