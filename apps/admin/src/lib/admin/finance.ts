import { createSupabaseServerClient } from '@/lib/supabase/server';

export const TRANSACTION_TYPE_FILTERS = [
  { value: 'all', label: 'All types' },
  { value: 'deposits', label: 'Deposits' },
  { value: 'escrow', label: 'Escrow / locks' },
  { value: 'payouts', label: 'Provider payouts' },
  { value: 'commission', label: 'Commission' },
  { value: 'refunds', label: 'Refunds' },
  { value: 'withdrawals', label: 'Withdrawals' },
  { value: 'adjustments', label: 'Adjustments' },
  { value: 'failed', label: 'Failed' },
  { value: 'reversals', label: 'Reversed' },
] as const;

export const TRANSACTION_STATUS_FILTERS = [
  { value: 'all', label: 'Any status' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'reversed', label: 'Reversed' },
] as const;

export const DEPOSIT_STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export const WITHDRAWAL_STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'reversed', label: 'Reversed' },
] as const;

export type TransactionListItem = {
  id: string;
  type: string;
  type_group: string;
  status: string;
  amount: number;
  reference: string;
  paystack_reference: string | null;
  request_id: string | null;
  user_id: string;
  user_name: string | null;
  description: string | null;
  created_at: string;
};

export async function fetchAdminTransactions(params: {
  query: string;
  typeGroup: string;
  status: string;
  limit: number;
  offset: number;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_transactions', {
    p_query: params.query,
    p_type_group: params.typeGroup,
    p_status: params.status,
    p_limit: params.limit,
    p_offset: params.offset,
  });
  if (error) throw new Error(error.message);
  const row = data as { total: number; limit: number; offset: number; items: TransactionListItem[] };
  return {
    total: row.total ?? 0,
    limit: row.limit ?? params.limit,
    offset: row.offset ?? params.offset,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function fetchAdminTransaction(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_transaction', { p_transaction_id: id });
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchAdminDeposits(params: {
  query: string;
  status: string;
  limit: number;
  offset: number;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_deposits', {
    p_query: params.query,
    p_status: params.status,
    p_limit: params.limit,
    p_offset: params.offset,
  });
  if (error) throw new Error(error.message);
  const row = data as { total: number; limit: number; offset: number; items: unknown[] };
  return {
    total: row.total ?? 0,
    limit: row.limit ?? params.limit,
    offset: row.offset ?? params.offset,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function fetchAdminDeposit(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_deposit', { p_deposit_id: id });
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchAdminWallets(params: { query: string; limit: number; offset: number }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_wallets', {
    p_query: params.query,
    p_limit: params.limit,
    p_offset: params.offset,
  });
  if (error) throw new Error(error.message);
  const row = data as { total: number; limit: number; offset: number; items: unknown[] };
  return {
    total: row.total ?? 0,
    limit: row.limit ?? params.limit,
    offset: row.offset ?? params.offset,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function fetchAdminWallet(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_wallet', { p_user_id: userId });
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchAdminWithdrawals(params: {
  query: string;
  status: string;
  limit: number;
  offset: number;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_list_withdrawals', {
    p_query: params.query,
    p_status: params.status,
    p_limit: params.limit,
    p_offset: params.offset,
  });
  if (error) throw new Error(error.message);
  const row = data as { total: number; limit: number; offset: number; items: unknown[] };
  return {
    total: row.total ?? 0,
    limit: row.limit ?? params.limit,
    offset: row.offset ?? params.offset,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

export async function fetchFinanceSummary(periodStart: string, periodEnd: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_finance_summary', {
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchFinancialExceptions() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_financial_exceptions');
  if (error) throw new Error(error.message);
  return data;
}
