'use client';

import type { UseQueryResult } from '@tanstack/react-query';

import { Badge } from '@/components/ui/Badge';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { MARKET } from '@/config';
import { formatMoney, formatWhenHome } from '@/lib/format';

function koboToMajor(kobo: number) {
  return kobo / 100;
}

type ContributionRow = {
  contribution_id: string;
  contributor_display_name: string | null;
  amount_kobo: number;
  contributed_at: string | null;
  viewer_is_self: boolean;
};

type AssignmentRow = {
  assignment_id: string;
  title: string;
  status: string;
  compensation_total_kobo: number;
  reservation_secured: boolean;
};

type ActivityRow = {
  event_type: string;
  summary: string;
  event_at: string | null;
};

function contributionLabel(row: ContributionRow) {
  if (row.viewer_is_self) return 'You';
  const name = row.contributor_display_name?.trim();
  return name && name.length > 0 ? name : 'Contributor';
}

export function ProjectContributionsPanel({
  contributions,
}: {
  contributions: UseQueryResult<ContributionRow[]>;
}) {
  if (contributions.isPending) {
    return <SkeletonBlock className="h-20 w-full rounded-2xl" />;
  }
  if (contributions.isError) {
    return <InlineError error={contributions.error} onRetry={() => void contributions.refetch()} />;
  }
  if ((contributions.data?.length ?? 0) === 0) {
    return (
      <EmptyState
        icon="wallet-outline"
        title="No contributions yet"
        message="Pool contributions will show up here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {contributions.data?.map((row) => (
        <li
          key={row.contribution_id}
          className="flex flex-row items-center justify-between gap-3 rounded-2xl border border-hairline bg-elevated px-4 py-3"
        >
          <div className="min-w-0 flex-1 gap-0.5">
            <p className="truncate text-base font-semibold text-ink">{contributionLabel(row)}</p>
            {row.contributed_at ? (
              <p className="text-xs text-muted">{formatWhenHome(row.contributed_at)}</p>
            ) : null}
          </div>
          <p className="shrink-0 text-base font-bold text-ink">
            {formatMoney(koboToMajor(row.amount_kobo), MARKET.currency)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function ProjectAssignmentsPanel({
  assignments,
}: {
  assignments: UseQueryResult<AssignmentRow[]>;
}) {
  if (assignments.isPending) {
    return <SkeletonBlock className="h-20 w-full rounded-2xl" />;
  }
  if (assignments.isError) {
    return <InlineError error={assignments.error} onRetry={() => void assignments.refetch()} />;
  }
  if ((assignments.data?.length ?? 0) === 0) {
    return (
      <EmptyState
        icon="briefcase-outline"
        title="No assignments"
        message="Work packages and roles for this project appear here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {assignments.data?.map((row) => (
        <li
          key={row.assignment_id}
          className="flex flex-col gap-1 rounded-2xl border border-hairline bg-elevated px-4 py-3"
        >
          <p className="text-base font-semibold text-ink">{row.title}</p>
          <div className="flex flex-row flex-wrap items-center gap-2">
            <Badge label={row.status.replaceAll('_', ' ')} tone="neutral" dot={false} />
            <p className="text-sm text-muted">
              {formatMoney(koboToMajor(row.compensation_total_kobo), MARKET.currency)}
            </p>
          </div>
          <p className="text-xs text-subtle">
            {row.reservation_secured ? 'Compensation secured' : 'Awaiting reserve'}
          </p>
        </li>
      ))}
    </ul>
  );
}

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
        message="Funding and project milestones will appear here."
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