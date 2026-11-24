import { describe, expect, it } from 'vitest';

import {
  classifyRoutePath,
  protectedRouteAllowsAuthState,
  publicMarketplaceAllowsAuthState,
} from '@/app/route-access';
import { resolveAuthRouteState } from '@/features/auth/auth-state';

describe('marketplace route access', () => {
  it('classifies public marketplace paths for guests', () => {
    expect(classifyRoutePath('/')).toBe('root_redirect');
    expect(classifyRoutePath('/home')).toBe('public_marketplace');
    expect(classifyRoutePath('/search')).toBe('public_marketplace');
    expect(classifyRoutePath('/request/abc')).toBe('public_marketplace');
    expect(classifyRoutePath('/respond/abc')).toBe('public_marketplace');
    expect(classifyRoutePath('/project/abc')).toBe('public_marketplace');
    expect(classifyRoutePath('/u/ada')).toBe('public_marketplace');
    expect(classifyRoutePath('/welcome')).toBe('public_guest');
    expect(classifyRoutePath('/sign-in')).toBe('public_guest');
    expect(classifyRoutePath('/install')).toBe('public_guest');
  });

  it('keeps account destinations protected', () => {
    expect(classifyRoutePath('/profile')).toBe('protected');
    expect(classifyRoutePath('/notifications')).toBe('protected');
    expect(classifyRoutePath('/request/new')).toBe('protected');
    expect(classifyRoutePath('/project/new')).toBe('protected');
    expect(classifyRoutePath('/wallet')).toBe('protected');
    expect(classifyRoutePath('/messages')).toBe('protected');
    expect(classifyRoutePath('/engagement/abc')).toBe('protected');
    expect(classifyRoutePath('/project/abc/assignment/def')).toBe('protected');
  });

  it('allows guests on public marketplace after hydration', () => {
    const state = resolveAuthRouteState({
      isAuthHydrated: true,
      hasSession: false,
      displayName: null,
    });
    expect(state).toBe('guest');
    expect(publicMarketplaceAllowsAuthState(state)).toBe(true);
    expect(protectedRouteAllowsAuthState(state)).toBe(false);
  });

  it('blocks guests from protected routes', () => {
    expect(protectedRouteAllowsAuthState('guest')).toBe(false);
    expect(protectedRouteAllowsAuthState('needs_onboarding')).toBe(false);
    expect(protectedRouteAllowsAuthState('signed_in')).toBe(true);
  });

  it('keeps incomplete onboarding off protected routes but not public browse', () => {
    const state = resolveAuthRouteState({
      isAuthHydrated: true,
      hasSession: true,
      displayName: null,
    });
    expect(state).toBe('needs_onboarding');
    expect(publicMarketplaceAllowsAuthState(state)).toBe(false);
    expect(protectedRouteAllowsAuthState(state)).toBe(false);
  });

  it('treats refresh paths the same as initial navigation', () => {
    const paths = ['/home', '/search', '/request/x', '/project/y', '/u/z'];
    for (const path of paths) {
      expect(classifyRoutePath(path)).toBe('public_marketplace');
    }
  });
});
