'use client';

import { ProjectAssignmentDeadlineCard } from '@/components/project-flow/ProjectAssignmentDeadlineCard';
import { ProjectWorkerAssignmentActions } from '@/components/project-flow/ProjectWorkerAssignmentActions';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { InlineError } from '@/components/ui/StateView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { MARKET } from '@/config';
import {
  useProjectAssignment,
  useProjectAssignmentMilestones,
} from '@/features/projects/project-api';
import {
  projectAssignmentStatusBadge,
  workerAssignmentAwaitingSubmissionReview,
} from '@/features/projects/project-assignment-presentation';
import { formatMoney } from '@/lib/format';
import { useRouter } from '@/lib/navigation';

export function ProjectWorkerAssignmentWorkCard({
  projectId,
  assignmentId,
  listTitle,
}: {
  projectId: string;
  assignmentId: string;
  /** Fallback label when detail is still loading */
  listTitle?: string | null;
}) {
  const router = useRouter();
  const assignment = useProjectAssignment(assignmentId);
  const milestones = useProjectAssignmentMilestones(
    assignment.data?.payment_structure === 'milestone' ? assignmentId : undefined,
  );

  const row = assignment.data;

  if (assignment.isPending) {
    return <SkeletonBlock className="h-40 w-full rounded-2xl" />;
  }

  if (assignment.isError) {
    return (
      <InlineError error={assignment.error} onRetry={() => void assignment.refetch()} />
    );
  }

  if (!row || row.project_id !== projectId || !row.viewer_is_worker) {
    return (
      <RequestCallout tone="warning" title="Assignment unavailable">
        <p className="text-sm text-muted">
          This assignment may have moved or you no longer have access.
        </p>
      </RequestCallout>
    );
  }

  const badge = workerAssignmentAwaitingSubmissionReview(row, milestones.data)
    ? { label: 'Awaiting review', tone: 'warning' as const }
    : projectAssignmentStatusBadge(row.status);
  const title = row.title || listTitle || 'Your assignment';

  return (
    <article className="shadow-card flex flex-col gap-4 rounded-2xl border border-hairline bg-elevated p-4">
      <Badge label={badge.label} tone={badge.tone} />
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold text-ink">{title}</h3>
        <p className="text-base font-semibold text-active">
          {formatMoney(row.compensation_total_kobo / 100, MARKET.currency)}
        </p>
      </div>

      {row.deliverables ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-bold uppercase tracking-widest text-subtle">Deliverables</p>
          <p className="whitespace-pre-wrap text-sm text-ink">{row.deliverables}</p>
        </div>
      ) : null}

      <ProjectAssignmentDeadlineCard dueAt={row.due_at} status={row.status} />

      <RequestCallout
        tone={row.reservation_secured ? 'info' : 'warning'}
        title={row.reservation_secured ? 'Compensation secured' : 'Compensation not secured'}
      >
        <p className="text-sm text-muted">
          {row.reservation_secured
            ? 'Your agreed pay is reserved from the project pool.'
            : 'You cannot commence until the creator secures compensation from the pool.'}
        </p>
      </RequestCallout>

      {row.has_open_dispute ? (
        <RequestCallout tone="danger" title="Open dispute">
          <p className="text-sm text-muted">Work and payouts are paused while a dispute is open.</p>
        </RequestCallout>
      ) : null}

      <ProjectWorkerAssignmentActions
        row={row}
        milestones={milestones.data}
        projectId={projectId}
      />

      <Button
        label="Assignment details"
        variant="secondary"
        corner="2xl"
        onClick={() => router.push(`/project/${projectId}/assignment/${assignmentId}`)}
      />
    </article>
  );
}