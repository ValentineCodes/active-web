import { describe, expect, it } from 'vitest';

/**
 * Documents optional identity contract: guests yield undefined, never a fabricated ID.
 * (Runtime hooks are covered by integration; this guards the pure contract.)
 */
function optionalUserIdFromSession(userId: string | undefined): string | undefined {
  return userId;
}

function strictUserIdFromOptional(userId: string | undefined): string {
  if (!userId) throw new Error('useUserId requires a signed-in session');
  return userId;
}

describe('optional user id', () => {
  it('returns undefined for guests without throwing', () => {
    expect(optionalUserIdFromSession(undefined)).toBeUndefined();
  });

  it('preserves authenticated user id', () => {
    expect(optionalUserIdFromSession('user-123')).toBe('user-123');
  });

  it('keeps useUserId strict for mandatory signed-in call sites', () => {
    expect(() => strictUserIdFromOptional(undefined)).toThrow(/signed-in session/);
    expect(strictUserIdFromOptional('user-123')).toBe('user-123');
  });
});