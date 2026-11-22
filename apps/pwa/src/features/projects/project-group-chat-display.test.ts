import { describe, expect, it } from 'vitest';

import {
  formatGroupMemberNames,
  groupMemberLineLabels,
} from '@/features/projects/project-group-chat-display';

describe('groupMemberLineLabels', () => {
  it('uses You for the signed-in member', () => {
    expect(
      groupMemberLineLabels(
        [
          { user_id: 'a', display_name: 'Ada' },
          { user_id: 'b', display_name: 'Ben' },
        ],
        'b',
      ),
    ).toEqual(['Ada', 'You']);
  });
});

describe('formatGroupMemberNames', () => {
  it('joins names with commas', () => {
    expect(formatGroupMemberNames(['Ada', 'Ben', 'Chi'])).toBe('Ada, Ben, Chi');
  });

  it('truncates with ellipsis when too long', () => {
    const names = ['Alexandra', 'Benjamin', 'Christopher', 'Danielle', 'Elizabeth'];
    const line = formatGroupMemberNames(names, 32);
    expect(line.endsWith('...')).toBe(true);
    expect(line.length).toBeLessThanOrEqual(35);
  });
});