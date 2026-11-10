import { useSession } from '@/features/auth/use-session';

export function useUserId(): string {
  const { session } = useSession();
  if (!session?.user.id) throw new Error('useUserId requires a signed-in session');
  return session.user.id;
}
