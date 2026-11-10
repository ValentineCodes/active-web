import { describe, expect, it } from 'vitest';

import { resolveAuthRouteState } from '@/features/auth/auth-state';

describe('auth route state', () => {
  it('transitions loading → guest → onboarding → signed in', () => {
    expect(resolveAuthRouteState({ isAuthHydrated: false, hasSession: false, displayName: null })).toBe(
      'loading',
    );
    expect(resolveAuthRouteState({ isAuthHydrated: true, hasSession: false, displayName: null })).toBe(
      'guest',
    );
    expect(resolveAuthRouteState({ isAuthHydrated: true, hasSession: true, displayName: null })).toBe(
      'needs_onboarding',
    );
    expect(
      resolveAuthRouteState({ isAuthHydrated: true, hasSession: true, displayName: 'Ada' }),
    ).toBe('signed_in');
  });
});
