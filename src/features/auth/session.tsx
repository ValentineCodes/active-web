import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { markSessionExpiredOnEntryToast } from '@/features/auth/session-expired-toast';
import { queryClient } from '@/lib/query/client';
import { clearPersistedQueryCache } from '@/lib/query/persist';
import { refreshSessionFromStorage } from '@/lib/supabase/auth-recovery';
import { supabase } from '@/lib/supabase/client';

type SessionState = {
  session: Session | null;
  /** False until Supabase has read the persisted session from device storage. */
  isAuthHydrated: boolean;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, isAuthHydrated: false });
  const backgroundRefreshRef = useRef(false);

  useEffect(() => {
    async function refreshInBackground(showExpiredToast: boolean) {
      if (backgroundRefreshRef.current) return;
      backgroundRefreshRef.current = true;
      try {
        await refreshSessionFromStorage({
          showExpiredToast: showExpiredToast ? markSessionExpiredOnEntryToast : () => {},
        });
      } finally {
        backgroundRefreshRef.current = false;
      }
    }

    if (AppState.currentState === 'active') {
      supabase.auth.startAutoRefresh();
    }

    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        setState({ session, isAuthHydrated: true });
        if (session) {
          void refreshInBackground(true);
        }
        return;
      }

      if (event === 'SIGNED_OUT') {
        queryClient.clear();
        void clearPersistedQueryCache();
        setState({ session: null, isAuthHydrated: true });
        return;
      }

      setState((previous) => ({ ...previous, session, isAuthHydrated: true }));
    });

    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        supabase.auth.startAutoRefresh();
        void refreshInBackground(true);
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });

    return () => {
      authSubscription.subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const sessionState = useContext(SessionContext);
  if (!sessionState) throw new Error('useSession was called outside SessionProvider');
  return sessionState;
}

/** For screens that only render inside the signed-in tree, where a session must exist. */
export function useUserId(): string {
  const { session } = useSession();
  if (!session) throw new Error('useUserId was called outside the signed-in navigator');
  return session.user.id;
}
