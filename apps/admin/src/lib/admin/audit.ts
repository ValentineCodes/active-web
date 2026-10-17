import { createSupabaseServerClient } from '@/lib/supabase/server';

export const AUDIT_ENTITY_FILTERS = [
  { value: 'all', label: 'All targets' },
  { value: 'user', label: 'Users' },
  { value: 'request', label: 'Requests' },
  { value: 'service_problem', label: 'Reports' },
  { value: 'admin_member', label: 'Administrators' },
] as const;

export type AuditListItem = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  correlation_id: string;
  actor_admin_id: string;
  actor_email: string | null;
  actor_role: string | null;
  created_at: string;
};

export async function fetchAuditEvents(params: {
  query: string;
  action: string;
  entityType: string;
  limit: number;
  offset: number;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_audit_events', {
    p_query: params.query,
    p_action: params.action === 'all' ? '' : params.action,
    p_entity_type: params.entityType === 'all' ? '' : params.entityType,
    p_limit: params.limit,
    p_offset: params.offset,
  });
  if (error) throw new Error(error.message);
  const row = data as { total: number; limit: number; offset: number; items: AuditListItem[] };
  return {
    total: row.total ?? 0,
    limit: row.limit ?? params.limit,
    offset: row.offset ?? params.offset,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function fetchAuditEvent(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_audit_event', { p_event_id: id });
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchAdminMembers() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_members');
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}
