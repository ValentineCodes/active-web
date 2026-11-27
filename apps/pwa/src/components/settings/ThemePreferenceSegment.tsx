'use client';

import { AnimatedSegmentedControl } from '@/components/ui/AnimatedSegmentedControl';
import type { ThemePreference } from '@/theme/preferences';

const OPTIONS = [
  { value: 'dark' as const, label: 'Dark' },
  { value: 'light' as const, label: 'Light' },
  { value: 'system' as const, label: 'System' },
];

export function ThemePreferenceSegment({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (next: ThemePreference) => void;
}) {
  return (
    <div role="group" aria-label="Appearance">
    <AnimatedSegmentedControl
      value={value}
      options={OPTIONS}
      onChange={onChange}
      className="flex w-full rounded-xs p-1"
      indicatorClassName="rounded-xs bg-active"
      selectedOptionClassName="text-on-brand"
      optionClassName="min-w-0 flex-1 rounded-xs px-1 py-2 text-xs font-semibold normal-case"
      transitionDurationMs={240}
    />
    </div>
  );
}