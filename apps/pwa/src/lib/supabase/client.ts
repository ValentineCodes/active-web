import { createClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';
import { browserSessionStorage } from '@/lib/supabase/session-storage';

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: browserSessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export function bindSupabaseAuthLifecycle() {
  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      void supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  };

  document.addEventListener('visibilitychange', onVisibility);
  if (document.visibilityState === 'visible') {
    void supabase.auth.startAutoRefresh();
  }

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    supabase.auth.stopAutoRefresh();
  };
}
