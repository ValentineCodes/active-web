'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { resolveAuthRouteState } from '@/features/auth/auth-state';
import { useSession } from '@/features/auth/use-session';
import { profileQueryOptions } from '@/features/profile/api';
import { LoadingScreen } from '@/components/LoadingScreen';

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

  useEffect(() => {
    if (loading) return;
    if (state === 'guest') router.replace('/welcome');
  }, [loading, state, router]);

  if (loading) return <LoadingScreen label="Loading…" />;
  if (state === 'guest') return <LoadingScreen label="Loading…" />;

  return children;
}

export function RequireOnboardingLayout({ children }: { children: ReactNode }) {
  const { loading, state } = useAuthRouteState();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (state === 'guest') router.replace('/welcome');
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
    if (state === 'guest') router.replace('/welcome');
    if (state === 'needs_onboarding') router.replace('/onboarding');
  }, [loading, state, router]);

  if (loading) return <LoadingScreen label="Loading…" />;
  if (state === 'guest' || state === 'needs_onboarding') {
    return <LoadingScreen label="Loading…" />;
  }

  return children;
}
