import { createSupabaseServerClient } from '@/lib/supabase/server';

export type UserListItem = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  phone: string | null;
  phone_confirmed: boolean;
  created_at: string;
  rating_average: number | null;
  rating_count: number;
  jobs_completed: number;
  requests_completed: number;
  is_onboarded: boolean;
  is_restricted: boolean;
  requests_posted_count: number;
  engagements_as_provider_count: number;
  reports_filed_count: number;
};

export type UserListResult = {
  total: number;
  limit: number;
  offset: number;
  items: UserListItem[];
};

export async function fetchAdminUsers(params: {
  query: string;
  filter: string;
  limit: number;
  offset: number;
}): Promise<UserListResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_users', {
    p_query: params.query,
    p_filter: params.filter,
    p_limit: params.limit,
    p_offset: params.offset,
  });

  if (error) throw new Error(error.message);
  const row = data as UserListResult;
  return {
    total: row.total ?? 0,
    limit: row.limit ?? params.limit,
    offset: row.offset ?? params.offset,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function fetchAdminUser(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_user', { p_user_id: userId });
  if (error) throw new Error(error.message);
  return data;
}
