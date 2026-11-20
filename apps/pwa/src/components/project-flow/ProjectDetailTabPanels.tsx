'use client';

import type { UseQueryResult } from '@tanstack/react-query';

import { EmptyState, InlineError } from '@/components/ui/StateView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { formatWhenHome } from '@/lib/format';

type ActivityRow = {
  event_type: string;
  summary: string;
  event_at: string | null;
};

export function ProjectActivityPanel({ activity }: { activity: UseQueryResult<ActivityRow[]> }) {
  if (activity.isPending) {
    return <SkeletonBlock className="h-16 w-full rounded-2xl" />;
  }
  if (activity.isError) {
    return <InlineError error={activity.error} onRetry={() => void activity.refetch()} />;
  }
  if ((activity.data?.length ?? 0) === 0) {
    return (
      <EmptyState
        icon="time-outline"
        title="No activity yet"
        message="Contributions, funding milestones, and other updates appear here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {activity.data?.map((row, index) => (
        <li
          key={`${row.event_type}-${index}`}
          className="flex flex-row gap-3 rounded-2xl border border-hairline bg-elevated px-4 py-3"
        >
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
          <div className="min-w-0 flex-1 gap-0.5">
            <p className="text-base font-medium text-ink">{row.summary}</p>
            {row.event_at ? (
              <p className="text-xs text-muted">{formatWhenHome(row.event_at)}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}