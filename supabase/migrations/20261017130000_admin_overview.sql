-- Aggregated operations dashboard metrics (authorized administrators only).

CREATE OR REPLACE FUNCTION public.admin_get_overview(
  p_period_start timestamptz,
  p_period_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_perms jsonb;
  v_finance boolean;
  v_result jsonb := '{}'::jsonb;
  v_counts jsonb;
  v_financial jsonb;
  v_trends jsonb;
  v_recent jsonb;
  v_warnings jsonb;
  v_snapshots jsonb;
BEGIN
  v_perms := public.get_my_admin_permissions();

  IF v_perms IS NULL OR coalesce((v_perms->>'overview')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN
    RAISE EXCEPTION 'invalid reporting period' USING errcode = '22023';
  END IF;

  v_finance := coalesce((v_perms->>'transactions')::boolean, false);

  SELECT jsonb_build_object(
    'total_users', (SELECT count(*)::bigint FROM public.profiles),
    'new_users_in_period', (
      SELECT count(*)::bigint
      FROM public.profiles p
      WHERE p.created_at >= p_period_start
        AND p.created_at < p_period_end
    ),
    'active_users_in_period', (
      SELECT count(*)::bigint
      FROM (
        SELECT e.actor_id AS user_id
        FROM public.request_status_events e
        WHERE e.created_at >= p_period_start
          AND e.created_at < p_period_end
        UNION
        SELECT r.requester_id
        FROM public.requests r
        WHERE r.created_at >= p_period_start
          AND r.created_at < p_period_end
        UNION
        SELECT r.selected_user_id
        FROM public.requests r
        WHERE r.selected_user_id IS NOT NULL
          AND r.updated_at >= p_period_start
          AND r.updated_at < p_period_end
        UNION
        SELECT m.sender_id
        FROM public.request_messages m
        WHERE m.created_at >= p_period_start
          AND m.created_at < p_period_end
      ) active_users
      WHERE user_id IS NOT NULL
    ),
    'open_requests', (
      SELECT count(*)::bigint
      FROM public.requests r
      WHERE r.status = 'awaiting_review'::public.request_status
        OR (
          r.status = 'posted'::public.request_status
          AND (r.expires_at IS NULL OR r.expires_at > now())
        )
        OR r.status = 'draft'::public.request_status
    ),
    'active_engagements', (
      SELECT count(*)::bigint
      FROM public.requests r
      WHERE r.status = ANY (
        ARRAY[
          'accepted'::public.request_status,
          'in_progress'::public.request_status,
          'completion_pending'::public.request_status,
          'disputed'::public.request_status
        ]
      )
    ),
    'completed_engagements_in_period', (
      SELECT count(*)::bigint
      FROM public.requests r
      WHERE r.status = 'completed'::public.request_status
        AND r.completed_at IS NOT NULL
        AND r.completed_at >= p_period_start
        AND r.completed_at < p_period_end
    ),
    'open_reports', (
      SELECT count(*)::bigint
      FROM public.service_problems sp
      WHERE sp.status = 'open'
    ),
    'pending_withdrawals', (
      SELECT count(*)::bigint
      FROM public.wallet_transactions wt
      WHERE wt.type = 'withdrawal'::public.wallet_transaction_type
        AND wt.status = 'pending'::public.wallet_transaction_status
    )
  )
  INTO v_counts;

  IF v_finance THEN
    SELECT jsonb_build_object(
      'funds_locked_active_engagements_kobo', coalesce((
        SELECT sum(pl.total)::bigint
        FROM public.payment_locks pl
        INNER JOIN public.requests r ON r.id = pl.request_id
        WHERE pl.status = 'active'::public.payment_lock_status
          AND r.status = ANY (
            ARRAY[
              'accepted'::public.request_status,
              'in_progress'::public.request_status,
              'completion_pending'::public.request_status,
              'disputed'::public.request_status
            ]
          )
      ), 0),
      'gross_settled_volume_kobo', coalesce((
        SELECT sum(pl.total)::bigint
        FROM public.payment_locks pl
        WHERE pl.status = 'released'::public.payment_lock_status
          AND pl.updated_at >= p_period_start
          AND pl.updated_at < p_period_end
      ), 0),
      'commission_earned_kobo', coalesce((
        SELECT sum(pl.service_fee)::bigint
        FROM public.payment_locks pl
        WHERE pl.status = 'released'::public.payment_lock_status
          AND pl.updated_at >= p_period_start
          AND pl.updated_at < p_period_end
      ), 0),
      'commission_collected_kobo', coalesce((
        SELECT sum(wt.amount)::bigint
        FROM public.wallet_transactions wt
        WHERE wt.type = 'service_fee'::public.wallet_transaction_type
          AND wt.status = 'completed'::public.wallet_transaction_status
          AND wt.created_at >= p_period_start
          AND wt.created_at < p_period_end
      ), 0),
      'commission_pending_on_active_locks_kobo', coalesce((
        SELECT sum(pl.service_fee)::bigint
        FROM public.payment_locks pl
        WHERE pl.status = 'active'::public.payment_lock_status
      ), 0),
      'refunds_in_period_kobo', coalesce((
        SELECT sum(wt.amount)::bigint
        FROM public.wallet_transactions wt
        WHERE wt.type = 'refund'::public.wallet_transaction_type
          AND wt.status = 'completed'::public.wallet_transaction_status
          AND wt.created_at >= p_period_start
          AND wt.created_at < p_period_end
      ), 0),
      'adjustments_in_period_kobo', coalesce((
        SELECT sum(wt.amount)::bigint
        FROM public.wallet_transactions wt
        WHERE wt.type = 'adjustment'::public.wallet_transaction_type
          AND wt.status = 'completed'::public.wallet_transaction_status
          AND wt.created_at >= p_period_start
          AND wt.created_at < p_period_end
      ), 0),
      'user_deposits_in_period_kobo', coalesce((
        SELECT sum(wt.amount)::bigint
        FROM public.wallet_transactions wt
        WHERE wt.type = 'deposit'::public.wallet_transaction_type
          AND wt.status = 'completed'::public.wallet_transaction_status
          AND wt.created_at >= p_period_start
          AND wt.created_at < p_period_end
      ), 0)
    )
    INTO v_financial;

    SELECT jsonb_build_object(
      'platform_wallet_available_kobo', coalesce((
        SELECT pw.available::bigint FROM public.platform_wallet pw WHERE pw.id = 1
      ), 0),
      'user_wallet_liabilities_kobo', coalesce((
        SELECT sum(w.available_balance + w.locked_balance)::bigint
        FROM public.wallets w
      ), 0)
    )
    INTO v_snapshots;
  ELSE
    v_financial := NULL;
    v_snapshots := NULL;
  END IF;

  SELECT coalesce(jsonb_agg(day_row ORDER BY day_row->>'day'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'day', to_char(d.day, 'YYYY-MM-DD'),
      'new_users', (
        SELECT count(*)::int
        FROM public.profiles p
        WHERE p.created_at >= d.day
          AND p.created_at < d.day + interval '1 day'
      ),
      'requests_posted', (
        SELECT count(*)::int
        FROM public.requests r
        WHERE r.submitted_at IS NOT NULL
          AND r.submitted_at >= d.day
          AND r.submitted_at < d.day + interval '1 day'
      ),
      'engagements_completed', (
        SELECT count(*)::int
        FROM public.requests r
        WHERE r.completed_at IS NOT NULL
          AND r.completed_at >= d.day
          AND r.completed_at < d.day + interval '1 day'
      ),
      'commission_collected_kobo', CASE
        WHEN v_finance THEN (
          SELECT coalesce(sum(wt.amount), 0)::bigint
          FROM public.wallet_transactions wt
          WHERE wt.type = 'service_fee'::public.wallet_transaction_type
            AND wt.status = 'completed'::public.wallet_transaction_status
            AND wt.created_at >= d.day
            AND wt.created_at < d.day + interval '1 day'
        )
        ELSE NULL
      END
    ) AS day_row
    FROM generate_series(
      date_trunc('day', p_period_start),
      date_trunc('day', p_period_end - interval '1 microsecond'),
      interval '1 day'
    ) AS d(day)
  ) series
  INTO v_trends;

  SELECT jsonb_build_object(
    'requests', coalesce((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC)
      FROM (
        SELECT
          r.id,
          r.title,
          r.status::text AS status,
          r.created_at
        FROM public.requests r
        ORDER BY r.created_at DESC
        LIMIT 8
      ) t
    ), '[]'::jsonb),
    'engagements', coalesce((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.accepted_at DESC NULLS LAST)
      FROM (
        SELECT
          r.id AS request_id,
          r.title,
          r.status::text AS status,
          r.accepted_at,
          r.payment_status::text AS payment_status
        FROM public.requests r
        WHERE r.selected_user_id IS NOT NULL
        ORDER BY coalesce(r.accepted_at, r.updated_at) DESC
        LIMIT 8
      ) t
    ), '[]'::jsonb),
    'reports', coalesce((
      SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC)
      FROM (
        SELECT
          sp.id,
          sp.request_id,
          sp.kind::text AS kind,
          sp.status,
          sp.respond_by,
          sp.created_at
        FROM public.service_problems sp
        WHERE sp.status = 'open'
        ORDER BY sp.created_at DESC
        LIMIT 8
      ) t
    ), '[]'::jsonb),
    'financial_activity', CASE
      WHEN v_finance THEN coalesce((
        SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC)
        FROM (
          SELECT
            wt.id,
            wt.type::text AS type,
            wt.status::text AS status,
            wt.amount,
            wt.request_id,
            wt.created_at
          FROM public.wallet_transactions wt
          WHERE wt.type <> 'deposit'::public.wallet_transaction_type
          ORDER BY wt.created_at DESC
          LIMIT 10
        ) t
      ), '[]'::jsonb)
      ELSE NULL
    END
  )
  INTO v_recent;

  SELECT coalesce(jsonb_agg(w ORDER BY (w->>'severity') DESC, (w->>'code')), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'code', 'reports_past_response_deadline',
      'severity', 'high',
      'message', format('%s open report(s) are past the response deadline', c),
      'href', '/reports?attention=overdue'
    ) AS w
    FROM (
      SELECT count(*)::int AS c
      FROM public.service_problems sp
      WHERE sp.status = 'open'
        AND sp.respond_by IS NOT NULL
        AND sp.respond_by < now()
    ) overdue
    WHERE c > 0
    UNION ALL
    SELECT jsonb_build_object(
      'code', 'disputed_engagements',
      'severity', 'medium',
      'message', format('%s engagement(s) in disputed status', c),
      'href', '/requests?status=disputed'
    )
    FROM (
      SELECT count(*)::int AS c
      FROM public.requests r
      WHERE r.status = 'disputed'::public.request_status
    ) disputed
    WHERE c > 0
    UNION ALL
    SELECT jsonb_build_object(
      'code', 'stale_pending_deposits',
      'severity', 'medium',
      'message', format('%s Paystack deposit(s) pending over 1 hour', c),
      'href', '/transactions?status=pending_deposit'
    )
    FROM (
      SELECT count(*)::int AS c
      FROM public.deposit_transactions dt
      WHERE dt.status IN (
        'pending'::public.deposit_transaction_status,
        'processing'::public.deposit_transaction_status
      )
        AND dt.created_at < now() - interval '1 hour'
    ) deposits
    WHERE c > 0
    UNION ALL
    SELECT jsonb_build_object(
      'code', 'pending_withdrawals',
      'severity', 'low',
      'message', format('%s withdrawal(s) awaiting processing', c),
      'href', '/withdrawals?status=pending'
    )
    FROM (
      SELECT count(*)::int AS c
      FROM public.wallet_transactions wt
      WHERE wt.type = 'withdrawal'::public.wallet_transaction_type
        AND wt.status = 'pending'::public.wallet_transaction_status
    ) withdrawals
    WHERE c > 0
  ) warnings
  INTO v_warnings;

  v_result := jsonb_build_object(
    'period', jsonb_build_object(
      'start', p_period_start,
      'end', p_period_end
    ),
    'definitions', jsonb_build_object(
      'active_users_in_period',
        'Distinct users with a request status event, new request, engagement update, or chat message in the period.',
      'open_requests',
        'Draft, awaiting_review, or posted requests that have not expired.',
      'active_engagements',
        'Requests in accepted, in_progress, completion_pending, or disputed.',
      'completed_engagements_in_period',
        'Requests marked completed with completed_at in the period.',
      'gross_settled_volume_kobo',
        'Sum of payment_locks.total for locks released (settled) in the period. Excludes open locks and refunds.',
      'commission_earned_kobo',
        'Sum of service_fee on payment locks released in the period (10% fee policy at lock creation).',
      'commission_collected_kobo',
        'Sum of completed service_fee wallet_transactions in the period (platform ledger recognition).',
      'commission_pending_on_active_locks_kobo',
        'Service fees on active payment locks not yet released.',
      'user_deposits_in_period_kobo',
        'User wallet deposits in the period — custodial liability funding, not platform revenue.',
      'platform_wallet_available_kobo',
        'Book balance in platform_wallet (commission and similar), not user wallet sums.',
      'user_wallet_liabilities_kobo',
        'Sum of user available + locked balances (owed to users).'
    ),
    'unavailable_metrics', jsonb_build_array(
      jsonb_build_object(
        'key', 'payment_processing_costs',
        'reason', 'Paystack fees are not stored in the database.'
      ),
      jsonb_build_object(
        'key', 'net_platform_revenue',
        'reason', 'Requires payment processing costs and other expenses; not reliably computable.'
      )
    ),
    'counts', v_counts,
    'financial', v_financial,
    'snapshots', v_snapshots,
    'trends', v_trends,
    'recent', v_recent,
    'warnings', v_warnings,
    'includes_financial', v_finance,
    'includes_settings', coalesce((v_perms->>'settings')::boolean, false)
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_overview(timestamptz, timestamptz) IS
  'Operations dashboard aggregate. Financial fields omitted unless the caller has transactions permission.';

REVOKE ALL ON FUNCTION public.admin_get_overview(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_overview(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_overview(timestamptz, timestamptz) TO service_role;
