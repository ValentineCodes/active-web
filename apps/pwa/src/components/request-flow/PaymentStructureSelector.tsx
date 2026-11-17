'use client';

import type { PaymentStructure } from '@/features/requests/milestones';

export function PaymentStructureSelector({
  value,
  onChange,
}: {
  value: PaymentStructure;
  onChange: (next: PaymentStructure) => void;
}) {
  const milestonesEnabled = value === 'milestone';

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-row items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
        <span className="flex-1 text-base font-semibold text-ink">Set up milestones</span>
        <input
          type="checkbox"
          checked={milestonesEnabled}
          onChange={(event) => onChange(event.target.checked ? 'milestone' : 'single')}
          className="h-5 w-5 shrink-0 accent-[var(--color-active)]"
        />
      </label>
      <p className="text-sm leading-5 text-muted">
        Optional. Pay in steps after you approve each one. Leave off for a single payment when the job is
        done.
      </p>
    </div>
  );
}