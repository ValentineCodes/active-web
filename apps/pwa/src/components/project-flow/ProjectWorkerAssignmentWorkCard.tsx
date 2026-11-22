'use client';

import { ProjectAssignmentCompletionSection } from '@/components/project-flow/ProjectAssignmentCompletionSection';
import { ProjectAssignmentDeadlineCard } from '@/components/project-flow/ProjectAssignmentDeadlineCard';
import { ProjectWorkerAssignmentActions } from '@/components/project-flow/ProjectWorkerAssignmentActions';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { Badge } from '@/components/ui/Badge';
import { InlineError } from '@/components/ui/StateView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { MARKET } from '@/config';
import {
  useProjectAssignment,
  useProjectAssignmentMilestones,
} from '@/features/projects/project-api';
import {
  projectAssignmentDisplayTitle,
  projectAssignmentSectionHeading,
  projectAssignmentStatusBadge,
  workerAssignmentAwaitingSubmissionReview,
} from '@/features/projects/project-assignment-presentation';
import { formatMoney } from '@/lib/format';
import { projectAssignmentRateHref } from '@/lib/project-assignment-rating-navigation';
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
  const sectionHeading = projectAssignmentSectionHeading(row.title, listTitle);
  const submitLabel =
    projectAssignmentDisplayTitle(row.title, listTitle) || listTitle || 'this assignment';

  return (
    <article className="shadow-card flex flex-col gap-4 rounded-2xl border border-hairline bg-elevated p-4">
      <Badge label={badge.label} tone={badge.tone} />
      <div className="flex flex-col gap-2">
        {sectionHeading ? (
          <h3 className="text-lg font-bold text-ink">{sectionHeading}</h3>
        ) : null}
        {row.description?.trim() ? (
          <p className="whitespace-pre-wrap text-base leading-6 text-ink">{row.description.trim()}</p>
        ) : null}
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

      {row.status !== 'completed' ? (
        <ProjectAssignmentDeadlineCard
          dueAt={row.due_at}
          status={row.status}
          commencedAt={row.commenced_at}
          proposedDeliveryDurationValue={row.proposed_delivery_duration_value}
          proposedDeliveryDurationUnit={row.proposed_delivery_duration_unit}
        />
      ) : null}

      {row.status === 'completed' ? (
        <ProjectAssignmentCompletionSection
          completedAt={row.completed_at}
          receivedRatingStars={row.received_rating_stars}
          receivedRatingComment={row.received_rating_comment}
          viewerMayRate={Boolean(row.viewer_may_rate)}
          viewerIsCreator={false}
          onRate={() => router.push(projectAssignmentRateHref(projectId, assignmentId))}
        />
      ) : null}

      {!row.reservation_secured ? (
        <RequestCallout tone="warning" title="Compensation not secured">
          <p className="text-sm text-muted">
            You cannot commence until the creator secures compensation from the pool.
          </p>
        </RequestCallout>
      ) : null}

      {row.has_open_dispute ? (
        <RequestCallout tone="danger" title="Open dispute">
          <p className="text-sm text-muted">Work and payouts are paused while a dispute is open.</p>
        </RequestCallout>
      ) : null}

      <ProjectWorkerAssignmentActions
        row={row}
        milestones={milestones.data}
        projectId={projectId}
        assignmentTitle={submitLabel}
      />
    </article>
  );
}