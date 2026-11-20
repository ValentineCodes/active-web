'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

type Props = {
  userId: string;
  role: string;
  username: string | null;
  premiumTrialEndsAt: string | null;
  reputation: {
    points_main?: number;
    shield_remaining?: number;
    tier?: string;
  } | null;
};

export function UserTrustPanel({ userId, role, username, premiumTrialEndsAt, reputation }: Props) {
  const [reason, setReason] = useState('');
  const [deltaMain, setDeltaMain] = useState('0');
  const [trialEnd, setTrialEnd] = useState(
    premiumTrialEndsAt?.slice(0, 16) ?? new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 16),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSuper = role === 'super_admin';

  const applyReputation = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reputation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deltaMain: Number(deltaMain),
          reason: reason.trim(),
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Request failed');
      setMessage('Crown adjustment recorded (audited).');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const extendTrial = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/premium-trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trialEndsAt: new Date(trialEnd).toISOString(),
          reason: reason.trim(),
          idempotencyKey: `trial-${userId}-${Date.now()}`,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Request failed');
      setMessage('Premium trial end updated (audited).');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const clearUsername = async () => {
    if (!username) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/clear-username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim(),
          idempotencyKey: `username-clear-${userId}-${Date.now()}`,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? 'Request failed');
      setMessage('Username cleared (audited).');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-elevated p-4 shadow-card">
      <h3 className="text-sm font-semibold text-ink">Trust & Premium</h3>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Username</dt>
          <dd>{username ? `@${username}` : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted">Premium trial ends</dt>
          <dd>{premiumTrialEndsAt ? new Date(premiumTrialEndsAt).toLocaleString() : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted">Crown tier</dt>
          <dd>{reputation?.tier ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted">Points</dt>
          <dd>
            {reputation?.points_main ?? 0} main · {reputation?.shield_remaining ?? 0} shield
          </dd>
        </div>
      </dl>

      <label className="mt-4 block text-sm text-muted">
        Reason (required for actions)
        <textarea
          className="mt-1 w-full rounded-lg border border-border bg-canvas p-2 text-sm text-ink"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      {message ? <p className="mt-2 text-sm text-brand">{message}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {username ? (
          <Button type="button" variant="secondary" disabled={busy || reason.trim().length < 10} onClick={clearUsername}>
            Clear username
          </Button>
        ) : null}
        {isSuper ? (
          <>
            <input
              type="datetime-local"
              className="rounded-lg border border-border px-2 py-1 text-sm"
              value={trialEnd}
              onChange={(event) => setTrialEnd(event.target.value)}
            />
            <Button type="button" variant="secondary" disabled={busy || reason.trim().length < 10} onClick={extendTrial}>
              Set trial end
            </Button>
            <input
              type="number"
              className="w-24 rounded-lg border border-border px-2 py-1 text-sm"
              value={deltaMain}
              onChange={(event) => setDeltaMain(event.target.value)}
            />
            <Button type="button" disabled={busy || reason.trim().length < 3} onClick={applyReputation}>
              Apply Crown delta
            </Button>
          </>
        ) : (
          <p className="text-xs text-subtle">Crown and Premium overrides require Super Admin.</p>
        )}
      </div>
    </section>
  );
}