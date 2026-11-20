import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ProjectListItem = {
  id: string;
  title: string;
  status: string;
  funding_status: string;
  funding_visibility: string;
  budget_total_kobo: number;
  funding_deadline_at: string | null;
  created_at: string;
  creator_name: string | null;
  creator_id: string;
  contributed_total_kobo: number;
};

export type ProjectListResult = {
  total: number;
  limit: number;
  offset: number;
  items: ProjectListItem[];
};

export async function fetchAdminProjects(params: {
  query: string;
  filter: string;
  limit: number;
  offset: number;
}): Promise<ProjectListResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_projects', {
    p_query: params.query,
    p_filter: params.filter,
    p_limit: params.limit,
    p_offset: params.offset,
  });
  if (error) throw new Error(error.message);
  const row = data as ProjectListResult;
  return {
    total: row.total ?? 0,
    limit: row.limit ?? params.limit,
    offset: row.offset ?? params.offset,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function fetchAdminProject(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_project', { p_project_id: projectId });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}