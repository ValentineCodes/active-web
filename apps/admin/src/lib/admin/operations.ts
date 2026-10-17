import { createSupabaseServerClient } from '@/lib/supabase/server';

export type OperationalIssue = {
  id: string;
  code: string;
  severity: string;
  message: string;
  href?: string;
  count?: number;
  detected_at?: string;
  last_attempt_at?: string;
  resolution_status: string;
  user_id?: string;
  request_id?: string;
  transaction_id?: string;
  available_actions?: Array<Record<string, unknown>>;
  error_detail?: string | null;
};

export async function fetchOperationalIssues() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_operational_issues');
  if (error) throw new Error(error.message);
  const row = data as {
    items: OperationalIssue[];
    gaps: Array<{ key: string; reason: string }>;
    read_only_default: boolean;
  };
  return {
    items: Array.isArray(row.items) ? row.items : [],
    gaps: Array.isArray(row.gaps) ? row.gaps : [],
    readOnlyDefault: row.read_only_default ?? true,
  };
}
