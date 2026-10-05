import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let serviceClient: SupabaseClient | null = null;

/** Service-role client for wallet/deposit writes from Edge Functions only. */
export function getServiceSupabase(): SupabaseClient {
  if (serviceClient) return serviceClient;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service role environment is not configured');
  }

  serviceClient = createClient(supabaseUrl, serviceRoleKey);
  return serviceClient;
}
