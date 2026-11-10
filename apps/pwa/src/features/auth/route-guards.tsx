import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { resolveAuthRouteState } from '@/features/auth/auth-state';
import { useSession } from '@/features/auth/use-session';
import { profileQueryOptions } from '@/features/profile/api';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useQuery } from '@tanstack/react-query';

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

export function GuestOnlyRoute() {
  const { loading, state } = useAuthRouteState();
  const location = useLocation();

  if (loading) return <LoadingScreen label="Loading…" />;
  if (state === 'needs_onboarding') return <Navigate to="/onboarding" replace />;
  if (state === 'signed_in') return <Navigate to="/home" replace state={{ from: location }} />;

  return <Outlet />;
}

export function RequireAuthRoute() {
  const { loading, state } = useAuthRouteState();
  const location = useLocation();

  if (loading) return <LoadingScreen label="Loading…" />;
  if (state === 'guest') {
    return <Navigate to="/welcome" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

export function RequireOnboardingRoute() {
  const { loading, state } = useAuthRouteState();

  if (loading) return <LoadingScreen label="Loading…" />;
  if (state === 'guest') return <Navigate to="/welcome" replace />;
  if (state === 'signed_in') return <Navigate to="/home" replace />;

  return <Outlet />;
}

export function RequireSignedInRoute() {
  const { loading, state } = useAuthRouteState();
  const location = useLocation();

  if (loading) return <LoadingScreen label="Loading…" />;
  if (state === 'guest') return <Navigate to="/welcome" replace state={{ from: location }} />;
  if (state === 'needs_onboarding') return <Navigate to="/onboarding" replace />;

  return <Outlet />;
}
