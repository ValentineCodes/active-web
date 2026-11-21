import type {
  ProjectAssignmentDetail,
  ProjectAssignmentMilestoneRow,
} from '@/features/projects/project-api';

type AssignmentStatus = ProjectAssignmentDetail['status'];

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  offered: 'Offered',
  terms_negotiation: 'Negotiating terms',
  accepted: 'Assigned',
  commenced: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

type BadgeTone = 'neutral' | 'brand' | 'active' | 'danger' | 'warning' | 'info';

export function projectAssignmentStatusBadge(status: AssignmentStatus): {
  label: string;
  tone: BadgeTone;
} {
  const label = STATUS_LABELS[status] ?? status.replaceAll('_', ' ');
  if (status === 'completed') return { label, tone: 'active' };
  if (status === 'commenced') return { label, tone: 'brand' };
  if (status === 'cancelled') return { label, tone: 'danger' };
  if (status === 'accepted') return { label, tone: 'info' };
  return { label, tone: 'neutral' };
}

export function resolveWorkerMaySubmit(
  row: ProjectAssignmentDetail,
  milestones?: ProjectAssignmentMilestoneRow[],
): boolean {
  if (typeof row.worker_may_submit === 'boolean') {
    return row.worker_may_submit;
  }
  if (row.payment_structure === 'milestone' && milestones?.length) {
    return milestones.some(
      (m) => m.status === 'in_progress' || m.status === 'revision_requested',
    );
  }
  return true;
}

export function workerAssignmentAwaitingSubmissionReview(
  row: ProjectAssignmentDetail,
  milestones?: ProjectAssignmentMilestoneRow[],
): boolean {
  if (!row.viewer_is_worker || row.status !== 'commenced' || row.has_open_dispute) {
    return false;
  }
  return !resolveWorkerMaySubmit(row, milestones);
}