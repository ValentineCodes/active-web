import 'react-native-url-polyfill/auto';

import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';
import type { Database } from '@/lib/supabase/database.types';
import { resolveSupabaseUrl } from '@/lib/supabase/resolve-url';
import { sessionStore } from '@/lib/supabase/session-store';

export const supabase = createClient<Database>(
  resolveSupabaseUrl(env.supabaseUrl),
  env.supabaseAnonKey,
  {
    auth: {
      storage: sessionStore,
      persistSession: true,
      autoRefreshToken: true,
      // There is no browser redirect in the OTP flow.
      detectSessionInUrl: false,
    },
  },
);

// Token refresh timers do not fire reliably while the app is backgrounded, so refreshing
// is tied to the foreground lifecycle instead.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
