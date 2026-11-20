'use client';

import { cn } from '@/lib/cn';

export type ProjectDetailTab = 'contributions' | 'assignments' | 'activity';

const INDICATOR_CLASS =
  'absolute bottom-0 left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full bg-ink';

const TABS: { id: ProjectDetailTab; label: string }[] = [
  { id: 'contributions', label: 'Contributions' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'activity', label: 'Activity' },
];

export function ProjectDetailTabs({
  active,
  onChange,
  showAssignments,
}: {
  active: ProjectDetailTab;
  onChange: (tab: ProjectDetailTab) => void;
  showAssignments: boolean;
}) {
  const visibleTabs = showAssignments
    ? TABS
    : TABS.filter((tab) => tab.id !== 'assignments');

  return (
    <div role="tablist" aria-label="Project sections" className="flex flex-row justify-center gap-7">
      {visibleTabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className="relative px-3 pb-3 pt-1 active:opacity-90"
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