import { describe, expect, it } from 'vitest';

/** Mirrors HomeTabBar guest notification badge rules. */
function notificationTabBadge(hasSession: boolean, unread: number | undefined) {
  return hasSession && unread != null && unread > 0 ? unread : undefined;
}

/** Mirrors HomeTabBar create tab press routing. */
function createTabTarget(hasSession: boolean): 'composer' | 'auth-prompt' {
  return hasSession ? 'composer' : 'auth-prompt';
}

describe('HomeTabBar guest behaviour', () => {
  it('does not show notification badge for guests', () => {
    expect(notificationTabBadge(false, 5)).toBeUndefined();
    expect(notificationTabBadge(false, 0)).toBeUndefined();
  });

  it('preserves notification badge for signed-in users', () => {
    expect(notificationTabBadge(true, 3)).toBe(3);
    expect(notificationTabBadge(true, 0)).toBeUndefined();
  });

  it('routes guests to contextual auth when create is tapped', () => {
    expect(createTabTarget(false)).toBe('auth-prompt');
    expect(createTabTarget(true)).toBe('composer');
  });
});