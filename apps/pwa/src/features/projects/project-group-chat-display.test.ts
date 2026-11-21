import { describe, expect, it } from 'vitest';

import { formatGroupMemberNames } from '@/features/projects/project-group-chat-display';

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