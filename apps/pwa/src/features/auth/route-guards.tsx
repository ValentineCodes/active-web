'use client';

import { useRouter } from '@/lib/navigation';
import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  contextualAuthActionForPath,
  savePendingAction,
} from '@/features/auth/pending-action';
import { dispatchContextualAuthPrompt } from '@/features/auth/ContextualAuthProvider';
import { resolveAuthRouteState } from '@/features/auth/auth-state';
import { useSession } from '@/features/auth/use-session';
import { usePathname } from '@/lib/navigation';
import { profileQueryOptions } from '@/features/profile/api';
import { LoadingScreen } from '@/components/LoadingScreen';

/** Guest marketplace and signed-in browse; redirects incomplete onboarding away from public listings. */
export function PublicMarketplaceLayout({ children }: { children: ReactNode }) {
  const { loading, state } = useAuthRouteState();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (state === 'needs_onboarding') router.replace('/onboarding');
  }, [loading, state, router]);

  if (loading) return <LoadingScreen label="Loading…" />;
  if (state === 'needs_onboarding') return <LoadingScreen label="Loading…" />;

  return children;
}

/** Blocks rendering until Supabase session is read from storage; does not redirect guests. */
export function SessionHydrationLayout({ children }: { children: ReactNode }) {
  const { isAuthHydrated } = useSession();
  if (!isAuthHydrated) return <LoadingScreen label="Loading…" />;
  return children;
}

function useAuthRouteState() {
  const { session, isAuthHydrated } = useSession();
  const userId = session?.user.id;
  const profile = useQuery({
    ...profileQueryOptions(userId ?? ''),
    enabled: isAuthHydrated && Boolean(userId),
  });

  const loading = !isAuthHydrated || (Boolean(userId) && profile.isLoading);

  const state = resolveAuthRouteState({
    isAuthHydrated,
    hasSession: Boolean(session),
    displayName: profile.data?.display_name,
  });

  return { loading, state, profile };
}

export function GuestOnlyLayout({ children }: { children: ReactNode }) {
  const { loading, state } = useAuthRouteState();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (state === 'needs_onboarding') router.replace('/onboarding');
    if (state === 'signed_in') router.replace('/home');
  }, [loading, state, router]);

  if (loading) return <LoadingScreen label="Loading…" />;
  if (state === 'needs_onboarding' || state === 'signed_in') return <LoadingScreen label="Loading…" />;

  return children;
}

export function RequireAuthLayout({ children }: { children: ReactNode }) {
  const { loading, state } = useAuthRouteState();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (state !== 'guest') return;
    const contextual = contextualAuthActionForPath(pathname);
    if (contextual && savePendingAction(contextual)) {
      router.replace('/home');
      dispatchContextualAuthPrompt();
      return;
    }
    router.replace('/home');
  }, [loading, pathname, router, state]);

  if (loading) return <LoadingScreen label="Loading…" />;
  if (state === 'guest') return <LoadingScreen label="Loading…" />;

  return children;
}

export function RequireOnboardingLayout({ children }: { children: ReactNode }) {
  const { loading, state } = useAuthRouteState();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (state === 'guest') router.replace('/home');
    if (state === 'signed_in') router.replace('/home');
  }, [loading, state, router]);

  if (loading) return <LoadingScreen label="Loading…" />;
  if (state === 'guest' || state === 'signed_in') return <LoadingScreen label="Loading…" />;

  return children;
}

export function RequireSignedInLayout({ children }: { children: ReactNode }) {
  const { loading, state } = useAuthRouteState();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (state === 'guest') router.replace('/home');
    if (state === 'needs_onboarding') router.replace('/onboarding');
  }, [loading, state, router]);

  if (loading) return <LoadingScreen label="Loading…" />;
  if (state === 'guest' || state === 'needs_onboarding') {
    return <LoadingScreen label="Loading…" />;
  }

  return children;
}
