import { describe, expect, it } from 'vitest';

import {
  filterWorkerAssignmentsForProject,
  isWorkerActiveAssignmentStatus,
} from '@/features/projects/project-worker-work';

describe('project worker work', () => {
  it('treats accepted through completed as active work', () => {
    expect(isWorkerActiveAssignmentStatus('accepted')).toBe(true);
    expect(isWorkerActiveAssignmentStatus('commenced')).toBe(true);
    expect(isWorkerActiveAssignmentStatus('completed')).toBe(true);
    expect(isWorkerActiveAssignmentStatus('offered')).toBe(false);
    expect(isWorkerActiveAssignmentStatus('terms_negotiation')).toBe(false);
  });

  it('filters assignments for a project', () => {
    const rows = [
      {
        assignment_id: 'a1',
        project_id: 'p1',
        status: 'accepted' as const,
        project_title: 'One',
        compensation_total_kobo: 1,
        due_at: null,
        reservation_secured: true,
      },
      {
        assignment_id: 'a2',
        project_id: 'p2',
        status: 'commenced' as const,
        project_title: 'Two',
        compensation_total_kobo: 1,
        due_at: null,
        reservation_secured: true,
      },
      {
        assignment_id: 'a3',
        project_id: 'p1',
        status: 'offered' as const,
        project_title: 'One',
        compensation_total_kobo: 1,
        due_at: null,
        reservation_secured: false,
      },
    ];
    const filtered = filterWorkerAssignmentsForProject(rows, 'p1');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.assignment_id).toBe('a1');
  });
});