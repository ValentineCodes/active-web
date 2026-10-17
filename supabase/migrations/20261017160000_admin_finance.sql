-- Admin finance directory: ledger, wallets, withdrawals, commission summary, reconciliation diagnostics.

CREATE OR REPLACE FUNCTION public.admin_wallet_type_group(p_type public.wallet_transaction_type)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN p_type IN (
      'deposit'::public.wallet_transaction_type,
      'manual_top_up'::public.wallet_transaction_type
    ) THEN 'deposits'
    WHEN p_type IN (
      'escrow_lock'::public.wallet_transaction_type,
      'escrow_top_up'::public.wallet_transaction_type,
      'escrow_partial_refund'::public.wallet_transaction_type,
      'escrow_pending'::public.wallet_transaction_type,
      'escrow_relock'::public.wallet_transaction_type,
      'escrow_release'::public.wallet_transaction_type
    ) THEN 'escrow'
    WHEN p_type = 'payout'::public.wallet_transaction_type THEN 'payouts'
    WHEN p_type = 'service_fee'::public.wallet_transaction_type THEN 'commission'
    WHEN p_type = 'refund'::public.wallet_transaction_type THEN 'refunds'
    WHEN p_type = 'withdrawal'::public.wallet_transaction_type THEN 'withdrawals'
    WHEN p_type = 'adjustment'::public.wallet_transaction_type THEN 'adjustments'
    ELSE 'other'
  END;
$$;

CREATE OR REPLACE FUNCTION public.admin_transaction_filter_matches(
  wt public.wallet_transactions,
  p_type_group text,
  p_status text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT
    (
      coalesce(btrim(p_type_group), 'all') = 'all'
      OR (
        p_type_group = 'failed'
        AND wt.status = 'failed'::public.wallet_transaction_status
      )
      OR (
        p_type_group = 'reversals'
        AND wt.status = 'reversed'::public.wallet_transaction_status
      )
      OR public.admin_wallet_type_group(wt.type) = btrim(p_type_group)
    )
    AND (
      coalesce(btrim(p_status), 'all') = 'all'
      OR wt.status::text = btrim(p_status)
    );
$$;

CREATE OR REPLACE FUNCTION public.admin_list_transactions(
  p_query text DEFAULT '',
  p_type_group text DEFAULT 'all',
  p_status text DEFAULT 'all',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_total integer;
  v_items jsonb;
BEGIN
  PERFORM public.admin_require_permission('transactions');

  SELECT count(*)::int
  INTO v_total
  FROM public.wallet_transactions wt
  INNER JOIN public.profiles p ON p.id = wt.user_id
  WHERE (
    v_q = ''
    OR wt.id::text ILIKE '%' || v_q || '%'
    OR wt.reference ILIKE '%' || v_q || '%'
    OR coalesce(wt.paystack_reference, '') ILIKE '%' || v_q || '%'
    OR wt.user_id::text ILIKE '%' || v_q || '%'
    OR coalesce(wt.request_id::text, '') ILIKE '%' || v_q || '%'
    OR coalesce(p.display_name, '') ILIKE '%' || v_q || '%'
  )
  AND public.admin_transaction_filter_matches(wt, p_type_group, p_status);

  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      wt.id,
      wt.type::text AS type,
      public.admin_wallet_type_group(wt.type) AS type_group,
      wt.status::text AS status,
      wt.amount,
      wt.reference,
      wt.paystack_reference,
      wt.request_id,
      wt.user_id,
      p.display_name AS user_name,
      wt.description,
      wt.created_at
    FROM public.wallet_transactions wt
    INNER JOIN public.profiles p ON p.id = wt.user_id
    WHERE (
      v_q = ''
      OR wt.id::text ILIKE '%' || v_q || '%'
      OR wt.reference ILIKE '%' || v_q || '%'
      OR coalesce(wt.paystack_reference, '') ILIKE '%' || v_q || '%'
      OR wt.user_id::text ILIKE '%' || v_q || '%'
      OR coalesce(wt.request_id::text, '') ILIKE '%' || v_q || '%'
      OR coalesce(p.display_name, '') ILIKE '%' || v_q || '%'
    )
    AND public.admin_transaction_filter_matches(wt, p_type_group, p_status)
    ORDER BY wt.created_at DESC
    LIMIT greatest(1, least(p_limit, 100))
    OFFSET greatest(0, p_offset)
  ) t;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', greatest(1, least(p_limit, 100)),
    'offset', greatest(0, p_offset),
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_transaction(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_row public.wallet_transactions%rowtype;
BEGIN
  PERFORM public.admin_require_permission('transactions');

  SELECT * INTO v_row
  FROM public.wallet_transactions wt
  WHERE wt.id = p_transaction_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'transaction not found' USING errcode = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'transaction', jsonb_build_object(
      'id', v_row.id,
      'wallet_id', v_row.wallet_id,
      'user_id', v_row.user_id,
      'type', v_row.type::text,
      'type_group', public.admin_wallet_type_group(v_row.type),
      'status', v_row.status::text,
      'amount', v_row.amount,
      'reference', v_row.reference,
      'paystack_reference', v_row.paystack_reference,
      'request_id', v_row.request_id,
      'description', v_row.description,
      'metadata', v_row.metadata,
      'created_at', v_row.created_at
    ),
    'user', (
      SELECT jsonb_build_object('id', p.id, 'display_name', p.display_name)
      FROM public.profiles p
      WHERE p.id = v_row.user_id
    ),
    'request', (
      SELECT jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'status', r.status::text,
        'payment_status', r.payment_status::text
      )
      FROM public.requests r
      WHERE r.id = v_row.request_id
    ),
    'deposit', (
      SELECT row_to_json(dt)
      FROM public.deposit_transactions dt
      WHERE dt.wallet_transaction_id = v_row.id
         OR dt.reference = v_row.reference
      ORDER BY dt.created_at DESC
      LIMIT 1
    ),
    'payment_lock', (
      SELECT row_to_json(pl)
      FROM public.payment_locks pl
      WHERE pl.request_id = v_row.request_id
      LIMIT 1
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_deposits(
  p_query text DEFAULT '',
  p_status text DEFAULT 'all',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_total integer;
  v_items jsonb;
BEGIN
  PERFORM public.admin_require_permission('transactions');

  SELECT count(*)::int
  INTO v_total
  FROM public.deposit_transactions dt
  INNER JOIN public.profiles p ON p.id = dt.user_id
  WHERE (
    v_q = ''
    OR dt.id::text ILIKE '%' || v_q || '%'
    OR dt.reference ILIKE '%' || v_q || '%'
    OR coalesce(dt.paystack_reference, '') ILIKE '%' || v_q || '%'
    OR dt.user_id::text ILIKE '%' || v_q || '%'
    OR coalesce(p.display_name, '') ILIKE '%' || v_q || '%'
  )
  AND (
    coalesce(btrim(p_status), 'all') = 'all'
    OR dt.status::text = btrim(p_status)
  );

  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      dt.id,
      dt.user_id,
      p.display_name AS user_name,
      dt.amount,
      dt.status::text AS status,
      dt.reference,
      dt.paystack_reference,
      dt.wallet_transaction_id,
      dt.created_at,
      dt.completed_at
    FROM public.deposit_transactions dt
    INNER JOIN public.profiles p ON p.id = dt.user_id
    WHERE (
      v_q = ''
      OR dt.id::text ILIKE '%' || v_q || '%'
      OR dt.reference ILIKE '%' || v_q || '%'
      OR coalesce(dt.paystack_reference, '') ILIKE '%' || v_q || '%'
      OR dt.user_id::text ILIKE '%' || v_q || '%'
      OR coalesce(p.display_name, '') ILIKE '%' || v_q || '%'
    )
    AND (
      coalesce(btrim(p_status), 'all') = 'all'
      OR dt.status::text = btrim(p_status)
    )
    ORDER BY dt.created_at DESC
    LIMIT greatest(1, least(p_limit, 100))
    OFFSET greatest(0, p_offset)
  ) t;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', greatest(1, least(p_limit, 100)),
    'offset', greatest(0, p_offset),
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_deposit(p_deposit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_row public.deposit_transactions%rowtype;
BEGIN
  PERFORM public.admin_require_permission('transactions');

  SELECT * INTO v_row
  FROM public.deposit_transactions dt
  WHERE dt.id = p_deposit_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'deposit not found' USING errcode = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'deposit', row_to_json(v_row),
    'user', (
      SELECT jsonb_build_object('id', p.id, 'display_name', p.display_name)
      FROM public.profiles p
      WHERE p.id = v_row.user_id
    ),
    'wallet_transaction', (
      SELECT row_to_json(wt)
      FROM public.wallet_transactions wt
      WHERE wt.id = v_row.wallet_transaction_id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_wallet_pending_kobo(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    (
      SELECT sum(pl.total)::bigint
      FROM public.payment_locks pl
      JOIN public.requests r ON r.id = pl.request_id
      WHERE pl.user_id = p_user_id
        AND pl.bucket = 'pending'::public.payment_lock_bucket
        AND pl.status = 'active'::public.payment_lock_status
        AND r.payment_status = 'pending'::public.payment_status
    ),
    0::bigint
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_wallet_locked_engagement_kobo(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    (
      SELECT sum(pl.total)::bigint
      FROM public.payment_locks pl
      JOIN public.requests r ON r.id = pl.request_id
      WHERE pl.user_id = p_user_id
        AND pl.bucket = 'locked'::public.payment_lock_bucket
        AND pl.status = 'active'::public.payment_lock_status
        AND r.payment_status = 'locked'::public.payment_status
    ),
    0::bigint
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_list_wallets(
  p_query text DEFAULT '',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_total integer;
  v_items jsonb;
BEGIN
  PERFORM public.admin_require_permission('wallets');

  SELECT count(*)::int
  INTO v_total
  FROM public.wallets w
  INNER JOIN public.profiles p ON p.id = w.user_id
  WHERE (
    v_q = ''
    OR w.user_id::text ILIKE '%' || v_q || '%'
    OR coalesce(p.display_name, '') ILIKE '%' || v_q || '%'
  );

  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.updated_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      w.user_id,
      p.display_name AS user_name,
      w.currency,
      w.available_balance AS available_kobo,
      w.locked_balance AS locked_balance_kobo,
      public.admin_wallet_pending_kobo(w.user_id) AS pending_kobo,
      w.updated_at
    FROM public.wallets w
    INNER JOIN public.profiles p ON p.id = w.user_id
    WHERE (
      v_q = ''
      OR w.user_id::text ILIKE '%' || v_q || '%'
      OR coalesce(p.display_name, '') ILIKE '%' || v_q || '%'
    )
    ORDER BY w.updated_at DESC
    LIMIT greatest(1, least(p_limit, 100))
    OFFSET greatest(0, p_offset)
  ) t;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', greatest(1, least(p_limit, 100)),
    'offset', greatest(0, p_offset),
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_wallet(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.admin_require_permission('wallets');

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id) THEN
    RAISE EXCEPTION 'user not found' USING errcode = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'wallet', (
      SELECT jsonb_build_object(
        'user_id', w.user_id,
        'wallet_id', w.id,
        'currency', w.currency,
        'available_kobo', w.available_balance,
        'locked_balance_kobo', w.locked_balance,
        'locked_engagement_kobo', public.admin_wallet_locked_engagement_kobo(w.user_id),
        'pending_kobo', public.admin_wallet_pending_kobo(w.user_id),
        'updated_at', w.updated_at
      )
      FROM public.wallets w
      WHERE w.user_id = p_user_id
    ),
    'user', (
      SELECT jsonb_build_object('id', p.id, 'display_name', p.display_name)
      FROM public.profiles p
      WHERE p.id = p_user_id
    ),
    'payment_locks', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.updated_at DESC)
      FROM (
        SELECT
          pl.request_id,
          r.title AS request_title,
          r.status::text AS request_status,
          r.payment_status::text AS payment_status,
          pl.provider_amount,
          pl.service_fee,
          pl.total,
          pl.bucket::text AS bucket,
          pl.status::text AS lock_status,
          pl.updated_at
        FROM public.payment_locks pl
        INNER JOIN public.requests r ON r.id = pl.request_id
        WHERE pl.user_id = p_user_id
        ORDER BY pl.updated_at DESC
        LIMIT 30
      ) x
    ), '[]'::jsonb),
    'ledger', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT
          wt.id,
          wt.type::text AS type,
          wt.status::text AS status,
          wt.amount,
          wt.reference,
          wt.paystack_reference,
          wt.request_id,
          wt.created_at
        FROM public.wallet_transactions wt
        WHERE wt.user_id = p_user_id
        ORDER BY wt.created_at DESC
        LIMIT 50
      ) x
    ), '[]'::jsonb),
    'balance_check', jsonb_build_object(
      'active_locks_total_kobo', coalesce((
        SELECT sum(pl.total)::bigint
        FROM public.payment_locks pl
        WHERE pl.user_id = p_user_id
          AND pl.status = 'active'::public.payment_lock_status
      ), 0),
      'stored_locked_balance_kobo', coalesce((
        SELECT w.locked_balance FROM public.wallets w WHERE w.user_id = p_user_id
      ), 0)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_withdrawals(
  p_query text DEFAULT '',
  p_status text DEFAULT 'all',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_total integer;
  v_items jsonb;
BEGIN
  PERFORM public.admin_require_permission('withdrawals');

  SELECT count(*)::int
  INTO v_total
  FROM public.wallet_transactions wt
  INNER JOIN public.profiles p ON p.id = wt.user_id
  WHERE wt.type = 'withdrawal'::public.wallet_transaction_type
  AND (
    v_q = ''
    OR wt.id::text ILIKE '%' || v_q || '%'
    OR wt.reference ILIKE '%' || v_q || '%'
    OR coalesce(wt.paystack_reference, '') ILIKE '%' || v_q || '%'
    OR wt.user_id::text ILIKE '%' || v_q || '%'
    OR coalesce(p.display_name, '') ILIKE '%' || v_q || '%'
  )
  AND (
    coalesce(btrim(p_status), 'all') = 'all'
    OR wt.status::text = btrim(p_status)
  );

  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      wt.id,
      wt.user_id,
      p.display_name AS user_name,
      wt.amount,
      wt.status::text AS status,
      wt.reference,
      wt.paystack_reference,
      wt.description,
      wt.metadata,
      wt.created_at
    FROM public.wallet_transactions wt
    INNER JOIN public.profiles p ON p.id = wt.user_id
    WHERE wt.type = 'withdrawal'::public.wallet_transaction_type
    AND (
      v_q = ''
      OR wt.id::text ILIKE '%' || v_q || '%'
      OR wt.reference ILIKE '%' || v_q || '%'
      OR coalesce(wt.paystack_reference, '') ILIKE '%' || v_q || '%'
      OR wt.user_id::text ILIKE '%' || v_q || '%'
      OR coalesce(p.display_name, '') ILIKE '%' || v_q || '%'
    )
    AND (
      coalesce(btrim(p_status), 'all') = 'all'
      OR wt.status::text = btrim(p_status)
    )
    ORDER BY wt.created_at DESC
    LIMIT greatest(1, least(p_limit, 100))
    OFFSET greatest(0, p_offset)
  ) t;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', greatest(1, least(p_limit, 100)),
    'offset', greatest(0, p_offset),
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_finance_summary(
  p_period_start timestamptz DEFAULT (now() - interval '30 days'),
  p_period_end timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_overview jsonb;
BEGIN
  PERFORM public.admin_require_permission('transactions');

  v_overview := public.admin_get_overview(p_period_start, p_period_end);

  RETURN jsonb_build_object(
    'period', v_overview->'period',
    'definitions', v_overview->'definitions',
    'unavailable_metrics', v_overview->'unavailable_metrics',
    'financial', v_overview->'financial',
    'snapshots', v_overview->'snapshots',
    'includes_financial', v_overview->'includes_financial'
  );
END;
$$;

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
  FROM public.wallet_transactions wt
  WHERE wt.type = 'withdrawal'::public.wallet_transaction_type
    AND wt.status = 'pending'::public.wallet_transaction_status;

  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'code', 'pending_withdrawals',
      'severity', 'low',
      'message', format('%s withdrawal ledger row(s) still pending', v_count),
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
    'read_only', true,
    'unsupported_actions', jsonb_build_array(
      jsonb_build_object(
        'key', 'manual_balance_edit',
        'reason', 'No admin balance adjustment RPC exists. Corrections require service_role ledger operations.'
      ),
      jsonb_build_object(
        'key', 'mark_withdrawal_success',
        'reason', 'Withdrawals are not productized; payout state must come from Paystack/backend settlement, not dashboard clicks.'
      ),
      jsonb_build_object(
        'key', 'offline_payment_verification',
        'reason', 'Schema has no offline/cash payment type; only wallet and Paystack deposit flows are modeled.'
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_transactions(text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_transactions(text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_transactions(text, text, text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_get_transaction(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_transaction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_transaction(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_deposits(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_deposits(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_deposits(text, text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_get_deposit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_deposit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_deposit(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_wallets(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_wallets(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_wallets(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_get_wallet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_wallet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_wallet(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_withdrawals(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_withdrawals(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_withdrawals(text, text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_get_finance_summary(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_finance_summary(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_finance_summary(timestamptz, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.admin_financial_exceptions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_financial_exceptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_financial_exceptions() TO service_role;
