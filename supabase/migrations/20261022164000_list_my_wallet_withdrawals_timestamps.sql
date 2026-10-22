-- Expose withdrawal lifecycle timestamps in the user list API (detail RPC already returns them).

DROP FUNCTION IF EXISTS public.list_my_wallet_withdrawals(integer, integer);

CREATE OR REPLACE FUNCTION public.list_my_wallet_withdrawals(
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  withdrawal_id uuid,
  amount_kobo bigint,
  currency text,
  status text,
  destination_bank_name text,
  destination_account_number_masked text,
  destination_account_name text,
  user_facing_reason text,
  wallet_transaction_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  processing_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  failed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    w.id,
    w.amount_kobo,
    w.currency,
    w.status::text,
    w.destination_bank_name,
    public.mask_bank_account_number(w.destination_account_number),
    w.destination_account_name,
    w.user_facing_reason,
    w.wallet_transaction_id,
    w.created_at,
    w.updated_at,
    w.processing_at,
    w.completed_at,
    w.rejected_at,
    w.failed_at
  FROM public.wallet_withdrawals w
  WHERE w.user_id = public.assert_authenticated()
  ORDER BY w.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 25), 100))
  OFFSET greatest(0, coalesce(p_offset, 0));
$$;

REVOKE ALL ON FUNCTION public.list_my_wallet_withdrawals(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_wallet_withdrawals(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_wallet_withdrawals(integer, integer) TO service_role;
