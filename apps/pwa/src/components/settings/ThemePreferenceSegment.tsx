'use client';

import type { ThemePreference } from '@/theme/preferences';
import { cn } from '@/lib/cn';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System Default' },
];

export function ThemePreferenceSegment({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (next: ThemePreference) => void;
}) {
  return (
    <div className="rounded-2xl bg-surface p-1.5" role="group" aria-label="Appearance">
      <div className="flex flex-row">
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                'min-w-0 flex-1 rounded-lg px-2 py-2.5 text-sm font-semibold active:opacity-90',
                selected ? 'bg-active text-on-brand' : 'text-muted',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
