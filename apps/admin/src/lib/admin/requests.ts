import { createSupabaseServerClient } from '@/lib/supabase/server';

export type RequestListItem = {
  id: string;
  title: string;
  description_preview: string | null;
  requester_id: string;
  requester_name: string | null;
  location_label: string;
  offered_amount: number | null;
  agreed_provider_amount: number | null;
  currency: string;
  status: string;
  payment_status: string;
  created_at: string;
  expires_at: string | null;
  selected_user_id: string | null;
  offer_count: number;
  pending_offer_count: number;
};

export type RequestListResult = {
  total: number;
  limit: number;
  offset: number;
  items: RequestListItem[];
};

export async function fetchAdminRequests(params: {
  query: string;
  statusGroup: string;
  limit: number;
  offset: number;
}): Promise<RequestListResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_requests', {
    p_query: params.query,
    p_status_group: params.statusGroup,
    p_limit: params.limit,
    p_offset: params.offset,
  });

  if (error) throw new Error(error.message);
  const row = data as RequestListResult;
  return {
    total: row.total ?? 0,
    limit: row.limit ?? params.limit,
    offset: row.offset ?? params.offset,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function fetchAdminRequest(requestId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_request', {
    p_request_id: requestId,
  });
  if (error) throw new Error(error.message);
  return data;
}
