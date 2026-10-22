import type { WithdrawalListItem, WithdrawalsOverview } from '@/lib/admin/withdrawals-shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type { WithdrawalListItem, WithdrawalsOverview } from '@/lib/admin/withdrawals-shared';
export { WITHDRAWAL_STATUS_FILTERS } from '@/lib/admin/withdrawals-shared';

function parseOptionalIso(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseOptionalKoboFromNgn(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const major = Number(value.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(major) || major < 0) return null;
  return Math.round(major * 100);
}

export async function fetchWithdrawalsOverview(): Promise<WithdrawalsOverview> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_withdrawals_overview');
  if (error) throw new Error(error.message);
  const row = data as WithdrawalsOverview;
  return row;
}

export async function fetchAdminWithdrawals(params: {
  query: string;
  status: string;
  submittedFrom?: string;
  submittedTo?: string;
  amountMinNgn?: string;
  amountMaxNgn?: string;
  userId?: string;
  limit: number;
  offset: number;
}) {
  const supabase = await createSupabaseServerClient();
  const userId = params.userId?.trim() || null;
  const { data, error } = await supabase.rpc('admin_list_withdrawals', {
    p_query: params.query,
    p_status: params.status,
    p_submitted_from: parseOptionalIso(params.submittedFrom),
    p_submitted_to: parseOptionalIso(params.submittedTo),
    p_amount_min_kobo: parseOptionalKoboFromNgn(params.amountMinNgn),
    p_amount_max_kobo: parseOptionalKoboFromNgn(params.amountMaxNgn),
    p_user_id: userId && /^[0-9a-f-]{36}$/i.test(userId) ? userId : null,
    p_limit: params.limit,
    p_offset: params.offset,
  });
  if (error) throw new Error(error.message);
  const row = data as { total: number; limit: number; offset: number; items: WithdrawalListItem[] };
  return {
    total: row.total ?? 0,
    limit: row.limit ?? params.limit,
    offset: row.offset ?? params.offset,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function fetchWithdrawalDetail(withdrawalId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_wallet_withdrawal_detail', {
    p_withdrawal_id: withdrawalId,
  });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}
