'use client';

import { cn } from '@/lib/cn';

const INDICATOR_CLASS = 'absolute bottom-0 left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full bg-ink';

export type ActivitySubTab = 'requests' | 'responses';

export function ActivitySubTabs({
  value,
  onChange,
}: {
  value: ActivitySubTab;
  onChange: (next: ActivitySubTab) => void;
}) {
  const tabs: { key: ActivitySubTab; label: string }[] = [
    { key: 'requests', label: 'My Requests' },
    { key: 'responses', label: 'My Responses' },
  ];

  return (
    <div className="flex flex-row justify-center gap-7 px-5">
      {tabs.map((tab) => {
        const selected = value === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className="relative px-3 pb-3 pt-1 active:opacity-90"
            aria-current={selected ? 'page' : undefined}
          >
            <span
              className={cn(
                'text-sm',
                selected ? 'font-bold text-ink' : 'font-semibold text-subtle opacity-[0.55]',
              )}
            >
              {tab.label}
            </span>
            {selected ? <span className={INDICATOR_CLASS} aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
