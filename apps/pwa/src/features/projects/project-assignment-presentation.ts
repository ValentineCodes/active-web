import type {
  ProjectAssignmentDetail,
  ProjectAssignmentMilestoneRow,
} from '@/features/projects/project-api';

type AssignmentStatus = ProjectAssignmentDetail['status'];

export const PROJECT_RESPONSE_PLACEHOLDER_TITLE = 'Your project response';

export function projectAssignmentDisplayTitle(
  termsTitle: string | null | undefined,
  projectTitle?: string | null,
): string {
  const trimmed = termsTitle?.trim() ?? '';
  if (!trimmed || trimmed === PROJECT_RESPONSE_PLACEHOLDER_TITLE) {
    return projectTitle?.trim() ?? '';
  }
  return trimmed;
}

/** Heading when assignment scope title differs from the project listing title. */
export function projectAssignmentSectionHeading(
  termsTitle: string | null | undefined,
  projectTitle?: string | null,
): string {
  const resolved = projectAssignmentDisplayTitle(termsTitle, projectTitle);
  const project = projectTitle?.trim() ?? '';
  if (!resolved || (project && resolved === project)) return '';
  return resolved;
}

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