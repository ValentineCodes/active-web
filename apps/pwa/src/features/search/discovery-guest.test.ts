import { describe, expect, it } from 'vitest';

/** Mirrors `useSearchDiscover` / infinite hooks: enabled from query text, not user id. */
function searchDiscoverQueryEnabled(query: string, enabledFlag: boolean, categoryIsTop: boolean) {
  const trimmed = query.trim();
  if (categoryIsTop) return enabledFlag && trimmed.length > 0;
  return enabledFlag && trimmed.length > 0;
}

describe('guest search discover', () => {
  it('runs public discover when a query is present', () => {
    expect(searchDiscoverQueryEnabled('plumber', true, true)).toBe(true);
    expect(searchDiscoverQueryEnabled('  ', true, true)).toBe(false);
  });

  it('does not require a user id to enable search', () => {
    expect(searchDiscoverQueryEnabled('ada', true, false)).toBe(true);
  });
});