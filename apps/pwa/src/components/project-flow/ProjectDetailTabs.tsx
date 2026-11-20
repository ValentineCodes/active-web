'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

export type ProjectDetailTab = 'response' | 'assignments' | 'activity';

const INDICATOR_WIDTH = 28;

const MANAGER_TABS: { id: ProjectDetailTab; label: string }[] = [
  { id: 'assignments', label: 'Responses' },
  { id: 'activity', label: 'Activity' },
];

const WORKER_TABS: { id: ProjectDetailTab; label: string }[] = [
  { id: 'response', label: 'Response' },
  { id: 'activity', label: 'Activity' },
];

export function ProjectDetailTabs({
  active,
  onChange,
  showAssignments,
  showResponse,
}: {
  active: ProjectDetailTab;
  onChange: (tab: ProjectDetailTab) => void;
  showAssignments: boolean;
  showResponse: boolean;
}) {
  const visibleTabs = showResponse
    ? WORKER_TABS
    : showAssignments
      ? MANAGER_TABS
      : MANAGER_TABS.filter((tab) => tab.id !== 'assignments');

  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorLeft, setIndicatorLeft] = useState(0);
  const [indicatorReady, setIndicatorReady] = useState(false);
  const activeIndex = Math.max(0, visibleTabs.findIndex((tab) => tab.id === active));

  const measureIndicator = useCallback(() => {
    const container = containerRef.current;
    const tab = tabRefs.current[activeIndex];
    if (!container || !tab) {
      setIndicatorReady(false);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const center = tabRect.left - containerRect.left + tabRect.width / 2;
    setIndicatorLeft(center - INDICATOR_WIDTH / 2);
    setIndicatorReady(true);
  }, [activeIndex]);

  useLayoutEffect(() => {
    measureIndicator();
  }, [active, activeIndex, measureIndicator, visibleTabs]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const tab = tabRefs.current[activeIndex];
    if (!container || !tab || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      measureIndicator();
    });
    observer.observe(container);
    observer.observe(tab);
    return () => observer.disconnect();
  }, [activeIndex, measureIndicator]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Project sections"
      className="relative w-full"
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-ink transition-[left,opacity] duration-200 ease-out',
          indicatorReady ? 'opacity-100' : 'opacity-0',
        )}
        style={{ width: INDICATOR_WIDTH, left: indicatorLeft }}
      />
      <div className="flex flex-row justify-center gap-7">
        {visibleTabs.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.id)}
              className="relative px-3 pb-3 pt-1 active:opacity-90"
            >
              <span
                className={cn(
                  'text-sm transition-colors duration-200',
                  selected ? 'font-bold text-ink' : 'font-semibold text-subtle opacity-[0.55]',
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}