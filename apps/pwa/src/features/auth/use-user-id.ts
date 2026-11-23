import { useSession } from '@/features/auth/use-session';

export function useOptionalUserId(): string | undefined {
  const { session } = useSession();
  return session?.user.id;
}

export function useHasSession(): boolean {
  const { session, isAuthHydrated } = useSession();
  return isAuthHydrated && Boolean(session);
}

export function useUserId(): string {
  const userId = useOptionalUserId();
  if (!userId) throw new Error('useUserId requires a signed-in session');
  return userId;
}
