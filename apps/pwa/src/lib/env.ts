const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

export const env = {
  supabaseUrl: supabaseUrl ?? '',
  supabaseAnonKey: supabaseAnonKey ?? '',
};
