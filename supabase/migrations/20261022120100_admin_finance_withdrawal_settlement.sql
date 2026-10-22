-- Align finance diagnostics with manual admin withdrawal settlement.

CREATE OR REPLACE FUNCTION public.admin_financial_exceptions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_items jsonb := '[]'::jsonb;
  v_count integer;
BEGIN
  IF coalesce((public.get_my_admin_permissions()->>'transactions')::boolean, false) IS NOT TRUE
     AND coalesce((public.get_my_admin_permissions()->>'operational_issues')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  SELECT count(*)::int
  INTO v_count
  FROM public.deposit_transactions dt
  WHERE dt.status IN (
    'pending'::public.deposit_transaction_status,
    'processing'::public.deposit_transaction_status
  )
    AND dt.created_at < now() - interval '1 hour';

  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', 'stale_pending_deposits',
      'severity', 'medium',
      'message', format('%s Paystack deposit(s) pending over 1 hour', v_count),
      'href', '/transactions?view=deposits&filter=pending',
      'count', v_count
    ));
  END IF;

  SELECT count(*)::int
  INTO v_count
  FROM public.deposit_transactions dt
  WHERE dt.status = 'completed'::public.deposit_transaction_status
    AND dt.wallet_transaction_id IS NULL;

  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', 'completed_deposit_without_ledger',
      'severity', 'high',
      'message', format('%s completed deposit(s) missing wallet ledger link', v_count),
      'href', '/transactions?view=deposits',
      'count', v_count
    ));
  END IF;

  SELECT count(*)::int
  INTO v_count
  FROM public.wallet_withdrawals w
  WHERE w.status IN (
    'pending'::public.wallet_withdrawal_status,
    'processing'::public.wallet_withdrawal_status
  );

  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', 'pending_withdrawals',
      'severity', 'low',
      'message', format('%s withdrawal(s) awaiting manual processing', v_count),
      'href', '/withdrawals?filter=pending',
      'count', v_count
    ));
  END IF;

  SELECT count(*)::int
  INTO v_count
  FROM public.wallets w
  WHERE w.locked_balance <> coalesce((
    SELECT sum(pl.total)::bigint
    FROM public.payment_locks pl
    WHERE pl.user_id = w.user_id
      AND pl.status = 'active'::public.payment_lock_status
  ), 0);

  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', 'wallet_lock_balance_mismatch',
      'severity', 'high',
      'message', format('%s wallet(s) with locked_balance ≠ sum of active payment locks', v_count),
      'href', '/wallets',
      'count', v_count
    ));
  END IF;

  SELECT count(*)::int
  INTO v_count
  FROM public.payment_locks pl
  INNER JOIN public.requests r ON r.id = pl.request_id
  WHERE pl.status = 'active'::public.payment_lock_status
    AND r.payment_status NOT IN (
      'locked'::public.payment_status,
      'pending'::public.payment_status,
      'disputed'::public.payment_status
    );

  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', 'active_lock_unexpected_payment_status',
      'severity', 'high',
      'message', format('%s active lock(s) on requests without locked/pending/disputed payment', v_count),
      'href', '/requests?filter=engaged',
      'count', v_count
    ));
  END IF;

  SELECT count(*)::int
  INTO v_count
  FROM public.requests r
  WHERE r.payment_status IN (
    'locked'::public.payment_status,
    'pending'::public.payment_status,
    'disputed'::public.payment_status
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.payment_locks pl
    WHERE pl.request_id = r.id
      AND pl.status = 'active'::public.payment_lock_status
  );

  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', 'funded_request_missing_active_lock',
      'severity', 'high',
      'message', format('%s request(s) with escrow payment status but no active payment lock', v_count),
      'href', '/requests?filter=engaged',
      'count', v_count
    ));
  END IF;

  SELECT count(*)::int
  INTO v_count
  FROM public.payment_locks pl
  WHERE pl.status = 'released'::public.payment_lock_status
    AND pl.service_fee > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.wallet_transactions wt
      WHERE wt.request_id = pl.request_id
        AND wt.type = 'service_fee'::public.wallet_transaction_type
        AND wt.status = 'completed'::public.wallet_transaction_status
    );

  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', 'released_lock_missing_commission_ledger',
      'severity', 'medium',
      'message', format('%s released lock(s) without a completed service_fee ledger entry', v_count),
      'href', '/transactions?filter=commission',
      'count', v_count
    ));
  END IF;

  RETURN jsonb_build_object(
    'items', v_items,
    'read_only', false,
    'unsupported_actions', jsonb_build_array(
      jsonb_build_object(
        'key', 'manual_balance_edit',
        'reason', 'No admin balance adjustment RPC exists. Corrections require service_role ledger operations.'
      ),
      jsonb_build_object(
        'key', 'offline_payment_verification',
        'reason', 'Schema has no offline/cash payment type; only wallet and Paystack deposit flows are modeled.'
      )
    )
  );
END;
$$;
