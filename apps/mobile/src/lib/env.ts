/**
 * Build-time configuration. Only `EXPO_PUBLIC_*` variables are inlined into the bundle,
 * and the anon key is safe there because every table is behind row level security.
 *
 * A missing value is a broken build, not something to paper over with a default.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Copy .env.example to .env and fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

if (supabaseAnonKey.startsWith('sb_publishable_')) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY must be the anon JWT from `supabase status` (starts with eyJ…), not the publishable key (sb_publishable_…).',
  );
}

export const env = { supabaseUrl, supabaseAnonKey };
