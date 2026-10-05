-- Paginated wallet transaction history for the mobile app.

CREATE OR REPLACE FUNCTION public.list_my_wallet_transactions(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  type public.wallet_transaction_type,
  status public.wallet_transaction_status,
  amount bigint,
  reference text,
  request_id uuid,
  paystack_reference text,
  description text,
  metadata jsonb,
  available_delta_kobo bigint,
  locked_delta_kobo bigint,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'limit must be between 1 and 200' USING errcode = '22023';
  END IF;

  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 10000 THEN
    RAISE EXCEPTION 'offset must be between 0 and 10000' USING errcode = '22023';
  END IF;

  RETURN QUERY
  SELECT
    wt.id,
    wt.type,
    wt.status,
    wt.amount,
    wt.reference,
    wt.request_id,
    wt.paystack_reference,
    wt.description,
    wt.metadata,
    coalesce((wt.metadata ->> 'available_delta_kobo')::bigint, 0),
    coalesce((wt.metadata ->> 'locked_delta_kobo')::bigint, 0),
    wt.created_at
  FROM public.wallet_transactions wt
  WHERE wt.user_id = v_user_id
  ORDER BY wt.created_at DESC, wt.id DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_wallet_transactions(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_wallet_transactions(integer, integer) TO service_role;
