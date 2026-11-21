import type { Database } from '@/lib/supabase/database.types';

export type ProjectAssignmentStatus = Database['public']['Enums']['project_assignment_status'];

/** Assignments where the worker is past handshake and doing (or finished) project work. */
export const WORKER_ACTIVE_ASSIGNMENT_STATUSES: ReadonlySet<ProjectAssignmentStatus> = new Set([
  'accepted',
  'commenced',
  'completed',
]);

export function isWorkerActiveAssignmentStatus(
  status: ProjectAssignmentStatus | string,
): boolean {
  return WORKER_ACTIVE_ASSIGNMENT_STATUSES.has(status as ProjectAssignmentStatus);
}

export function filterWorkerAssignmentsForProject<
  T extends { project_id: string; status: ProjectAssignmentStatus },
>(rows: T[], projectId: string): T[] {
  return rows.filter(
    (row) => row.project_id === projectId && isWorkerActiveAssignmentStatus(row.status),
  );
}