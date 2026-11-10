'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { SessionContext, type SessionState } from '@/features/auth/session-context';
import { clearClientUserState } from '@/lib/clear-client-user-state';
import { queryClient } from '@/lib/query/client';
import {
  bindAuthStorageSync,
  reconcileSessionFromStorage,
} from '@/lib/supabase/auth-storage-sync';
import { bindSupabaseAuthLifecycle, supabase } from '@/lib/supabase/client';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    session: null,
    isAuthHydrated: false,
  });

  useEffect(() => {
    const removeAuthLifecycle = bindSupabaseAuthLifecycle();
    const removeStorageSync = bindAuthStorageSync(() => {
      void reconcileSessionFromStorage();
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setState({ session, isAuthHydrated: true });
        return;
      }
      if (event === 'SIGNED_OUT') {
        clearClientUserState();
        queryClient.clear();
        setState({ session: null, isAuthHydrated: true });
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
      removeAuthLifecycle();
      removeStorageSync();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}
