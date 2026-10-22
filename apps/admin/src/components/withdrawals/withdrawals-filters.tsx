'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { WITHDRAWAL_STATUS_FILTERS } from '@/lib/admin/withdrawals-shared';

export function WithdrawalsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [userId, setUserId] = useState(searchParams.get('userId') ?? '');
  const [submittedFrom, setSubmittedFrom] = useState(searchParams.get('from') ?? '');
  const [submittedTo, setSubmittedTo] = useState(searchParams.get('to') ?? '');
  const [amountMin, setAmountMin] = useState(searchParams.get('amountMin') ?? '');
  const [amountMax, setAmountMax] = useState(searchParams.get('amountMax') ?? '');
  const activeFilter = searchParams.get('filter') ?? 'all';

  const apply = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    params.delete('offset');
    startTransition(() => {
      router.push(`/withdrawals?${params.toString()}`);
    });
  };

  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-elevated p-4 shadow-card"
      onSubmit={(event) => {
        event.preventDefault();
        apply({
          q: query.trim() || undefined,
          userId: userId.trim() || undefined,
          from: submittedFrom || undefined,
          to: submittedTo || undefined,
          amountMin: amountMin.trim() || undefined,
          amountMax: amountMax.trim() || undefined,
        });
      }}
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
          Search reference, user, or ID
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink"
            placeholder="Reference, name, user id…"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
          User ID
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            className="rounded-lg border border-border bg-canvas px-3 py-2 font-mono text-sm text-ink"
            placeholder="UUID"
          />
        </label>
        <Button type="submit" variant="secondary" loading={pending}>Apply filters</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Submitted from
          <input
            type="date"
            value={submittedFrom}
            onChange={(event) => setSubmittedFrom(event.target.value)}
            className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Submitted to
          <input
            type="date"
            value={submittedTo}
            onChange={(event) => setSubmittedTo(event.target.value)}
            className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Min amount (NGN)
          <input
            value={amountMin}
            onChange={(event) => setAmountMin(event.target.value.replace(/[^\d]/g, ''))}
            className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
            inputMode="numeric"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Max amount (NGN)
          <input
            value={amountMax}
            onChange={(event) => setAmountMax(event.target.value.replace(/[^\d]/g, ''))}
            className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
            inputMode="numeric"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {WITHDRAWAL_STATUS_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => apply({ filter: option.value === 'all' ? undefined : option.value })}
            className={
              activeFilter === option.value
                ? 'rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-lg border border-border bg-canvas px-3 py-1.5 text-sm text-muted hover:text-ink'
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </form>
  );
}
