'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

type Props = {
  withdrawalId: string;
  masked: string;
};

export function RevealAccountButton({ withdrawalId, masked }: Props) {
  const [full, setFull] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reveal = async () => {
    setError(null);
    setLoading(true);
    try {
      const idempotencyKey = globalThis.crypto?.randomUUID?.() ?? `reveal-${Date.now()}`;
      const response = await fetch(`/api/admin/withdrawals/${withdrawalId}/reveal-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey }),
      });
      const payload = (await response.json()) as {
        error?: string;
        data?: { destination_account_number?: string } | null;
        ok?: boolean;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not reveal account number');
      }
      const inner = payload.data as { destination_account_number?: string } | null;
      const account = inner?.destination_account_number;
      if (!account) {
        throw new Error('Unexpected response');
      }
      setFull(account);
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : 'Could not reveal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="font-mono text-sm">{full ?? masked}</p>
      {!full ? (
        <Button variant="secondary" loading={loading} onClick={() => void reveal()}>
          Show full account number
        </Button>
      ) : (
        <p className="text-xs text-muted">View logged in audit trail.</p>
      )}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
