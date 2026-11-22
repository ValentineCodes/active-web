'use client';

import { ProjectWorkerAssignmentWorkCard } from '@/components/project-flow/ProjectWorkerAssignmentWorkCard';
import { RequestCallout } from '@/components/request-flow/RequestCallout';
import { InlineError } from '@/components/ui/StateView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import type { MyProjectAssignmentRow } from '@/features/projects/project-api';

export function ProjectWorkerWorkPanel({
  projectId,
  assignments,
  assignmentsLoading,
  assignmentsError,
  onRetry,
}: {
  projectId: string;
  assignments: MyProjectAssignmentRow[];
  assignmentsLoading: boolean;
  assignmentsError: Error | null;
  onRetry: () => void;
}) {

  if (assignmentsLoading) {
    return (
      <div className="flex flex-col gap-3">
        <SkeletonBlock className="h-20 w-full rounded-2xl" />
        <SkeletonBlock className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (assignmentsError) {
    return <InlineError error={assignmentsError} onRetry={onRetry} />;
  }

  if (assignments.length === 0) {
    return (
      <RequestCallout tone="warning" title="No active assignment">
        <p className="text-sm text-muted">
          If you were just assigned, pull to refresh or reopen the project.
        </p>
      </RequestCallout>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {assignments.length > 1 ? (
        <p className="text-sm font-semibold text-ink">
          {assignments.length} assignments on this project
        </p>
      ) : null}

      <ul className="flex flex-col gap-4">
        {assignments.map((row) => (
          <li key={row.assignment_id}>
            <ProjectWorkerAssignmentWorkCard
              projectId={projectId}
              assignmentId={row.assignment_id}
              listTitle={row.project_title}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}