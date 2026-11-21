import { describe, expect, it } from 'vitest';

import {
  projectResponseCreatorMayReview,
  projectResponseListBucket,
  projectResponsesForFilter,
  type ProjectResponseListRow,
} from '@/features/projects/project-response-list';

function row(
  overrides: Partial<ProjectResponseListRow> & Pick<ProjectResponseListRow, 'assignment_id' | 'worker_id'>,
): ProjectResponseListRow {
  return {
    display_name: 'Test',
    avatar_path: '',
    bio: '',
    rating_average: 0,
    rating_count: 0,
    completion_percent: 0,
    identity_verified: false,
    message: '',
    quoted_amount: 0,
    status: 'offered',
    created_at: new Date().toISOString(),
    proposed_delivery_duration_value: 1,
    proposed_delivery_duration_unit: 'weeks',
    proposed_delivery_at: new Date().toISOString(),
    proposed_delivery_timezone: '',
    responder_available: true,
    terms_proposed_by: overrides.worker_id,
    creator_may_review: false,
    ...overrides,
  };
}

describe('projectResponseListBucket', () => {
  it('splits completed from active assignments', () => {
    expect(projectResponseListBucket('completed')).toBe('completed');
    expect(projectResponseListBucket('commenced')).toBe('assigned');
    expect(projectResponseListBucket('accepted')).toBe('assigned');
  });

  it('filters lists by tab', () => {
    const rows = [
      row({ assignment_id: 'a1', worker_id: 'w1', status: 'completed' }),
      row({ assignment_id: 'a2', worker_id: 'w2', status: 'commenced' }),
    ];
    expect(projectResponsesForFilter(rows, 'assigned')).toHaveLength(1);
    expect(projectResponsesForFilter(rows, 'completed')).toHaveLength(1);
    expect(projectResponsesForFilter(rows, 'all')).toHaveLength(2);
  });
});

describe('projectResponseCreatorMayReview', () => {
  it('trusts creator_may_review when true', () => {
    expect(
      projectResponseCreatorMayReview(
        row({
          assignment_id: 'a',
          worker_id: 'w',
          creator_may_review: true,
          terms_proposed_by: 'creator',
        }),
      ),
    ).toBe(true);
  });

  it('is false for creator-proposed assignment offers', () => {
    expect(
      projectResponseCreatorMayReview(
        row({
          assignment_id: 'a',
          worker_id: 'w',
          terms_proposed_by: 'creator',
          creator_may_review: false,
        }),
      ),
    ).toBe(false);
  });

  it('falls back to worker-proposed terms when creator_may_review is missing', () => {
    expect(
      projectResponseCreatorMayReview(
        row({
          assignment_id: 'a',
          worker_id: 'w',
          creator_may_review: undefined as unknown as boolean,
          terms_proposed_by: 'w',
          status: 'offered',
        }),
      ),
    ).toBe(true);
  });

  it('allows legacy list rows without review flags on awaiting statuses', () => {
    expect(
      projectResponseCreatorMayReview(
        row({
          assignment_id: 'a',
          worker_id: 'w',
          creator_may_review: undefined as unknown as boolean,
          terms_proposed_by: undefined as unknown as string,
          status: 'offered',
        }),
      ),
    ).toBe(true);
  });
});