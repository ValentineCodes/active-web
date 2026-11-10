export type AuthRouteState = 'loading' | 'guest' | 'needs_onboarding' | 'signed_in';

export function resolveAuthRouteState(input: {
  isAuthHydrated: boolean;
  hasSession: boolean;
  displayName: string | null | undefined;
}): AuthRouteState {
  if (!input.isAuthHydrated) return 'loading';
  if (!input.hasSession) return 'guest';
  if (!input.displayName?.trim()) return 'needs_onboarding';
  return 'signed_in';
}
