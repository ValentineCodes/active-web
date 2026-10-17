'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { cn } from '@/lib/cn';
import type { OverviewRangePreset } from '@/lib/overview/period';

const PRESETS: { id: OverviewRangePreset; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
];

export function OverviewDateRange() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active =
    (searchParams.get('range') as OverviewRangePreset | null) ??
    (searchParams.get('from') ? 'custom' : '30d');

  const setPreset = (preset: OverviewRangePreset) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('from');
    params.delete('to');
    params.set('range', preset);
    router.push(`/overview?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted">Period</span>
      <div className="inline-flex rounded-lg border border-border bg-elevated p-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setPreset(preset.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active === preset.id
                ? 'bg-brand text-white'
                : 'text-muted hover:bg-surface hover:text-ink',
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {searchParams.get('from') ? (
        <span className="text-xs text-subtle">
          Custom: {searchParams.get('from')} → {searchParams.get('to')}
        </span>
      ) : null}
    </div>
  );
}
