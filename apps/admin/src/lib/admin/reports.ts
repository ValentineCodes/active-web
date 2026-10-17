import { createSupabaseServerClient } from '@/lib/supabase/server';

export const REPORT_KIND_LABELS: Record<string, string> = {
  completion_issue: 'Completion issue',
  provider_no_show: 'Provider no-show',
  client_no_show: 'Client no-show',
  provider_unreachable: 'Provider unreachable',
  service_not_completed: 'Service not completed',
  service_differs_from_request: 'Service differs from request',
  other: 'Other',
};

export const REPORT_QUEUE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'under_review', label: 'Under review' },
  { value: 'awaiting_info', label: 'Awaiting information' },
  { value: 'awaiting_counterparty', label: 'Awaiting counterparty' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'assigned_to_me', label: 'Assigned to me' },
  { value: 'open', label: 'Open (all)' },
  { value: 'resolved', label: 'Resolved' },
] as const;

export type ReportListItem = {
  id: string;
  kind: string;
  status: string;
  resolution: string | null;
  description: string;
  created_at: string;
  resolved_at: string | null;
  respond_by: string | null;
  reported_by: string;
  reporter_name: string | null;
  request_id: string;
  request_title: string;
  requester_id: string;
  provider_id: string | null;
  provider_name: string | null;
  assigned_admin_id: string | null;
  queue_status: string;
  queue_label: string;
};

export type ReportListResult = {
  total: number;
  limit: number;
  offset: number;
  items: ReportListItem[];
};

export async function fetchAdminReports(params: {
  query: string;
  filter: string;
  limit: number;
  offset: number;
}): Promise<ReportListResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_reports', {
    p_query: params.query,
    p_filter: params.filter,
    p_limit: params.limit,
    p_offset: params.offset,
  });

  if (error) throw new Error(error.message);
  const row = data as ReportListResult;
  return {
    total: row.total ?? 0,
    limit: row.limit ?? params.limit,
    offset: row.offset ?? params.offset,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function fetchAdminReport(reportId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_report', {
    p_report_id: reportId,
  });
  if (error) throw new Error(error.message);
  return data;
}
