import { createContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export type SessionState = {
  session: Session | null;
  isAuthHydrated: boolean;
};

export const SessionContext = createContext<SessionState | null>(null);
