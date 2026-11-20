'use client';

import { cn } from '@/lib/cn';

export type ProfileHubTab = 'requests' | 'responses' | 'projects';

const TABS: { id: ProfileHubTab; label: string }[] = [
  { id: 'requests', label: 'Requests' },
  { id: 'responses', label: 'Responses' },
  { id: 'projects', label: 'Projects' },
];

export function ProfileStickyTabs({
  active,
  onChange,
}: {
  active: ProfileHubTab;
  onChange: (tab: ProfileHubTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Profile activity"
      className="-mx-5 sticky top-0 z-10 flex flex-row border-b border-hairline bg-canvas px-2"
    >
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className="relative min-h-11 flex-1 py-2 text-center active:opacity-90"
          >
            <span className={cn('text-sm font-semibold', selected ? 'text-ink' : 'text-muted')}>
              {tab.label}
            </span>
            {selected ? (
              <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}