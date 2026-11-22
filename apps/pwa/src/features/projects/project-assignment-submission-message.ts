import type { RequestMessage } from '@/features/requests/conversation-message-model';

export type ProjectAssignmentSubmissionMetadata = {
  kind: 'project_assignment_submission';
  submission_id: string;
  assignment_id: string;
  project_id: string;
  assignment_title?: string;
  milestone_title?: string | null;
  milestone_position?: number | null;
  review_state?: string;
};

export function parseProjectAssignmentSubmissionMetadata(
  metadata: RequestMessage['metadata'],
): ProjectAssignmentSubmissionMetadata | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const row = metadata as Record<string, unknown>;
  if (row.kind !== 'project_assignment_submission') return null;
  if (typeof row.submission_id !== 'string' || typeof row.assignment_id !== 'string') return null;
  if (typeof row.project_id !== 'string') return null;
  return {
    kind: 'project_assignment_submission',
    submission_id: row.submission_id,
    assignment_id: row.assignment_id,
    project_id: row.project_id,
    assignment_title: typeof row.assignment_title === 'string' ? row.assignment_title : undefined,
    milestone_title: typeof row.milestone_title === 'string' ? row.milestone_title : null,
    milestone_position:
      typeof row.milestone_position === 'number' ? row.milestone_position : null,
    review_state: typeof row.review_state === 'string' ? row.review_state : 'awaiting_review',
  };
}

export function isProjectAssignmentSubmissionMessage(message: RequestMessage): boolean {
  return parseProjectAssignmentSubmissionMetadata(message.metadata) !== null;
}

/** Worker-written note only — omits legacy server default bodies. */
export function projectAssignmentSubmissionDisplayNote(body: string): string {
  const trimmed = body.trim();
  if (/^Submitted work for /i.test(trimmed)) return '';
  return trimmed;
}

/** Single-line label on the formal submission chip in project group chat. */
export function projectAssignmentSubmissionChatBadgeLabel(reviewState: string | undefined): string {
  switch (reviewState) {
    case 'approved_paid':
      return 'Approved and paid';
    case 'milestone_paid':
      return 'Milestone paid';
    case 'awaiting_review':
      return 'Work done! Please review';
    default:
      return 'Work done! Please review';
  }
}