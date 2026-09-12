import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { queryClient } from '@/lib/query/client';
import { supabase } from '@/lib/supabase/client';

type SessionState = { session: Session | null; isRestoring: boolean };

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, isRestoring: true });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, isRestoring: false });

      // Nothing cached belongs to the next person to sign in on this device.
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const state = useContext(SessionContext);
  if (!state) throw new Error('useSession was called outside SessionProvider');
  return state;
}

/** For screens that only render inside the signed-in tree, where a session must exist. */
export function useUserId(): string {
  const { session } = useSession();
  if (!session) throw new Error('useUserId was called outside the signed-in navigator');
  return session.user.id;
}
