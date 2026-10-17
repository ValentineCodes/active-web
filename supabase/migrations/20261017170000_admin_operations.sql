-- Operational issue queue, recovery actions, audit log access, and member management audits.

CREATE OR REPLACE FUNCTION public.admin_redact_json(p_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    ELSE (
      SELECT coalesce(jsonb_object_agg(key, val), '{}'::jsonb)
      FROM (
        SELECT
          e.key,
          CASE
            WHEN lower(e.key) ~ '(secret|password|token|authorization|api_key|paystack)'
              THEN to_jsonb('[redacted]'::text)
            WHEN jsonb_typeof(e.value) = 'object' THEN public.admin_redact_json(e.value)
            WHEN jsonb_typeof(e.value) = 'array' THEN (
              SELECT coalesce(jsonb_agg(
                CASE
                  WHEN jsonb_typeof(elem) = 'object' THEN public.admin_redact_json(elem)
                  ELSE elem
                END
              ), '[]'::jsonb)
              FROM jsonb_array_elements(e.value) elem
            )
            ELSE e.value
          END AS val
        FROM jsonb_each(p_value) e
      ) redacted
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.admin_operational_issues()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_items jsonb := '[]'::jsonb;
  v_count integer;
  v_detected timestamptz;
  v_last timestamptz;
  v_row record;
BEGIN
  IF coalesce((public.get_my_admin_permissions()->>'operational_issues')::boolean, false) IS NOT TRUE
     AND coalesce((public.get_my_admin_permissions()->>'transactions')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  SELECT count(*)::int, min(dt.created_at), max(dt.created_at)
  INTO v_count, v_detected, v_last
  FROM public.deposit_transactions dt
  WHERE dt.status IN (
    'pending'::public.deposit_transaction_status,
    'processing'::public.deposit_transaction_status
  )
    AND dt.created_at < now() - interval '1 hour';

  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', 'stale_pending_deposits:aggregate',
      'code', 'stale_pending_deposits',
      'severity', 'medium',
      'message', format('%s Paystack deposit(s) pending over 1 hour', v_count),
      'href', '/transactions?view=deposits&filter=pending',
      'count', v_count,
      'detected_at', v_detected,
      'last_attempt_at', v_last,
      'resolution_status', 'open',
      'available_actions', '[]'::jsonb
    ));
  END IF;

  SELECT count(*)::int, min(dt.completed_at), max(dt.completed_at)
  INTO v_count, v_detected, v_last
  FROM public.deposit_transactions dt
  WHERE dt.status = 'completed'::public.deposit_transaction_status
    AND dt.wallet_transaction_id IS NULL;

  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', 'completed_deposit_without_ledger:aggregate',
      'code', 'completed_deposit_without_ledger',
      'severity', 'high',
      'message', format('%s completed deposit(s) missing wallet ledger link', v_count),
      'href', '/transactions?view=deposits',
      'count', v_count,
      'detected_at', v_detected,
      'last_attempt_at', v_last,
      'resolution_status', 'open',
      'available_actions', '[]'::jsonb
    ));
  END IF;

  SELECT count(*)::int, min(wt.created_at), max(wt.created_at)
  INTO v_count, v_detected, v_last
  FROM public.wallet_transactions wt
  WHERE wt.type = 'withdrawal'::public.wallet_transaction_type
    AND wt.status = 'pending'::public.wallet_transaction_status;

  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', 'pending_withdrawals:aggregate',
      'code', 'pending_withdrawals',
      'severity', 'low',
      'message', format('%s withdrawal ledger row(s) still pending', v_count),
      'href', '/withdrawals?filter=pending',
      'count', v_count,
      'detected_at', v_detected,
      'last_attempt_at', v_last,
      'resolution_status', 'open',
      'available_actions', '[]'::jsonb
    ));
  END IF;

  SELECT count(*)::int, min(w.updated_at), max(w.updated_at)
  INTO v_count, v_detected, v_last
  FROM public.wallets w
  WHERE w.locked_balance <> coalesce((
    SELECT sum(pl.total)::bigint
    FROM public.payment_locks pl
    WHERE pl.user_id = w.user_id
      AND pl.status = 'active'::public.payment_lock_status
  ), 0);

  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', 'wallet_lock_balance_mismatch:aggregate',
      'code', 'wallet_lock_balance_mismatch',
      'severity', 'high',
      'message', format('%s wallet(s) with locked_balance ≠ active payment locks', v_count),
      'href', '/wallets',
      'count', v_count,
      'detected_at', v_detected,
      'last_attempt_at', v_last,
      'resolution_status', 'open',
      'available_actions', '[]'::jsonb
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
      'id', 'active_lock_unexpected_payment_status:aggregate',
      'code', 'active_lock_unexpected_payment_status',
      'severity', 'high',
      'message', format('%s active lock(s) on requests without locked/pending/disputed payment', v_count),
      'href', '/requests?filter=engaged',
      'count', v_count,
      'detected_at', now(),
      'resolution_status', 'open',
      'available_actions', '[]'::jsonb
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
      'id', 'funded_request_missing_active_lock:aggregate',
      'code', 'funded_request_missing_active_lock',
      'severity', 'high',
      'message', format('%s request(s) with escrow payment status but no active lock', v_count),
      'href', '/requests?filter=engaged',
      'count', v_count,
      'detected_at', now(),
      'resolution_status', 'open',
      'available_actions', '[]'::jsonb
    ));
  END IF;

  FOR v_row IN
    SELECT r.id AS request_id, r.requester_id, r.completion_confirm_by
    FROM public.requests r
    WHERE r.status = 'completion_pending'::public.request_status
      AND r.completion_confirm_by IS NOT NULL
      AND r.completion_confirm_by < now()
    ORDER BY r.completion_confirm_by ASC
    LIMIT 50
  LOOP
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', 'completion_auto_complete_overdue:' || v_row.request_id::text,
      'code', 'completion_auto_complete_overdue',
      'severity', 'medium',
      'message', 'Completion confirmation deadline passed; auto-completion job may not have run',
      'href', '/requests/' || v_row.request_id::text,
      'count', 1,
      'detected_at', v_row.completion_confirm_by,
      'last_attempt_at', v_row.completion_confirm_by,
      'resolution_status', 'open',
      'user_id', v_row.requester_id,
      'request_id', v_row.request_id,
      'available_actions', jsonb_build_array(jsonb_build_object(
        'action', 'auto_complete_request',
        'label', 'Run authorized auto-completion',
        'requires_reason', true,
        'requires_confirmation', true
      ))
    ));
  END LOOP;

  FOR v_row IN
    SELECT r.id AS request_id, r.requester_id, r.completed_at
    FROM public.requests r
    WHERE r.status = 'completed'::public.request_status
      AND r.payment_status IN (
        'locked'::public.payment_status,
        'pending'::public.payment_status,
        'disputed'::public.payment_status
      )
    ORDER BY r.completed_at DESC NULLS LAST
    LIMIT 50
  LOOP
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', 'completed_payment_not_released:' || v_row.request_id::text,
      'code', 'completed_payment_not_released',
      'severity', 'high',
      'message', 'Request completed but payment was not released',
      'href', '/requests/' || v_row.request_id::text,
      'count', 1,
      'detected_at', v_row.completed_at,
      'resolution_status', 'open',
      'user_id', v_row.requester_id,
      'request_id', v_row.request_id,
      'available_actions', '[]'::jsonb
    ));
  END LOOP;

  SELECT count(*)::int
  INTO v_count
  FROM public.requests r
  WHERE r.status = 'disputed'::public.request_status
    AND NOT EXISTS (
      SELECT 1
      FROM public.service_problems sp
      WHERE sp.request_id = r.id
        AND sp.status = 'open'
    );

  IF v_count > 0 THEN
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', 'disputed_without_open_report:aggregate',
      'code', 'disputed_without_open_report',
      'severity', 'medium',
      'message', format('%s disputed request(s) without an open service problem', v_count),
      'href', '/requests?filter=disputed',
      'count', v_count,
      'detected_at', now(),
      'resolution_status', 'open',
      'available_actions', '[]'::jsonb
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
      'id', 'released_lock_missing_commission_ledger:aggregate',
      'code', 'released_lock_missing_commission_ledger',
      'severity', 'medium',
      'message', format('%s released lock(s) without completed service_fee ledger entry', v_count),
      'href', '/transactions?filter=commission',
      'count', v_count,
      'detected_at', now(),
      'resolution_status', 'open',
      'available_actions', '[]'::jsonb
    ));
  END IF;

  RETURN jsonb_build_object(
    'items', v_items,
    'gaps', jsonb_build_array(
      jsonb_build_object(
        'key', 'paystack_webhook_failures',
        'reason', 'Webhook outcomes are logged to edge function logs only; no durable retry queue exists in Postgres.'
      ),
      jsonb_build_object(
        'key', 'notification_delivery_failures',
        'reason', 'Push delivery status is not persisted; only in-app notification_inbox rows exist.'
      ),
      jsonb_build_object(
        'key', 'scheduled_job_failures',
        'reason', 'pg_cron job failures are not recorded in application tables.'
      ),
      jsonb_build_object(
        'key', 'deposit_settlement_retry',
        'reason', 'Paystack-verified deposit settlement requires the paystack-webhook / wallet_record_deposit service_role path; dashboard cannot safely retry without provider verification.'
      )
    ),
    'read_only_default', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_execute_operational_recovery(
  p_action text,
  p_request_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_completed boolean;
  v_status public.request_status;
  v_payment public.payment_status;
  v_confirm_by timestamptz;
BEGIN
  PERFORM public.admin_require_permission('operational_issues');

  IF p_action IS DISTINCT FROM 'auto_complete_request' THEN
    RAISE EXCEPTION 'unsupported recovery action' USING errcode = '22023';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request_id is required' USING errcode = '22023';
  END IF;

  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'a reason of at least 10 characters is required' USING errcode = '22023';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  SELECT r.status, r.payment_status, r.completion_confirm_by
  INTO v_status, v_payment, v_confirm_by
  FROM public.requests r
  WHERE r.id = p_request_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_status <> 'completion_pending'::public.request_status
     OR v_confirm_by IS NULL
     OR v_confirm_by >= now() THEN
    RAISE EXCEPTION 'request is not eligible for auto-completion recovery' USING errcode = '55000';
  END IF;

  v_before := jsonb_build_object(
    'status', v_status::text,
    'payment_status', v_payment::text,
    'completion_confirm_by', v_confirm_by
  );

  v_completed := public.auto_complete_request(p_request_id);

  SELECT r.status, r.payment_status
  INTO v_status, v_payment
  FROM public.requests r
  WHERE r.id = p_request_id;

  v_after := jsonb_build_object(
    'status', v_status::text,
    'payment_status', v_payment::text,
    'auto_complete_applied', v_completed
  );

  PERFORM public.admin_record_audit_event(
    'operational_recovery',
    'request'::public.admin_audit_entity_type,
    p_request_id,
    btrim(p_reason),
    'operational-recovery:' || p_idempotency_key,
    public.admin_redact_json(jsonb_build_object(
      'action', p_action,
      'before', v_before,
      'after', v_after,
      'result', CASE WHEN v_completed THEN 'success' ELSE 'no_op' END
    ))
  );

  RETURN jsonb_build_object(
    'ok', true,
    'applied', v_completed,
    'before', v_before,
    'after', v_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_audit_events(
  p_query text DEFAULT '',
  p_action text DEFAULT '',
  p_entity_type text DEFAULT '',
  p_limit integer DEFAULT 50,
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
  PERFORM public.admin_require_permission('audit_logs');

  SELECT count(*)::int
  INTO v_total
  FROM public.admin_audit_events a
  LEFT JOIN auth.users u ON u.id = a.actor_admin_id
  LEFT JOIN public.admin_members am ON am.user_id = a.actor_admin_id
  WHERE (
    v_q = ''
    OR a.id::text ILIKE '%' || v_q || '%'
    OR a.action ILIKE '%' || v_q || '%'
    OR coalesce(a.entity_id::text, '') ILIKE '%' || v_q || '%'
    OR coalesce(u.email, '') ILIKE '%' || v_q || '%'
    OR coalesce(a.idempotency_key, '') ILIKE '%' || v_q || '%'
  )
  AND (btrim(coalesce(p_action, '')) = '' OR a.action = btrim(p_action))
  AND (
    btrim(coalesce(p_entity_type, '')) = ''
    OR a.entity_type::text = btrim(p_entity_type)
  );

  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      a.id,
      a.action,
      a.entity_type::text AS entity_type,
      a.entity_id,
      a.reason,
      public.admin_redact_json(a.metadata) AS metadata,
      a.idempotency_key AS correlation_id,
      a.actor_admin_id,
      u.email AS actor_email,
      am.role::text AS actor_role,
      a.created_at
    FROM public.admin_audit_events a
    LEFT JOIN auth.users u ON u.id = a.actor_admin_id
    LEFT JOIN public.admin_members am ON am.user_id = a.actor_admin_id
    WHERE (
      v_q = ''
      OR a.id::text ILIKE '%' || v_q || '%'
      OR a.action ILIKE '%' || v_q || '%'
      OR coalesce(a.entity_id::text, '') ILIKE '%' || v_q || '%'
      OR coalesce(u.email, '') ILIKE '%' || v_q || '%'
      OR coalesce(a.idempotency_key, '') ILIKE '%' || v_q || '%'
    )
    AND (btrim(coalesce(p_action, '')) = '' OR a.action = btrim(p_action))
    AND (
      btrim(coalesce(p_entity_type, '')) = ''
      OR a.entity_type::text = btrim(p_entity_type)
    )
    ORDER BY a.created_at DESC
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

CREATE OR REPLACE FUNCTION public.admin_get_audit_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_row public.admin_audit_events%rowtype;
BEGIN
  PERFORM public.admin_require_permission('audit_logs');

  SELECT * INTO v_row
  FROM public.admin_audit_events a
  WHERE a.id = p_event_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'audit event not found' USING errcode = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_row.id,
      'action', v_row.action,
      'entity_type', v_row.entity_type::text,
      'entity_id', v_row.entity_id,
      'reason', v_row.reason,
      'metadata', public.admin_redact_json(v_row.metadata),
      'correlation_id', v_row.idempotency_key,
      'actor_admin_id', v_row.actor_admin_id,
      'created_at', v_row.created_at
    ),
    'actor', (
      SELECT jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'role', am.role::text
      )
      FROM auth.users u
      LEFT JOIN public.admin_members am ON am.user_id = u.id
      WHERE u.id = v_row.actor_admin_id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_members()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.admin_require_permission('settings');

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at ASC)
    FROM (
      SELECT
        am.user_id,
        u.email,
        am.role::text AS role,
        am.created_at,
        am.updated_at,
        am.created_by
      FROM public.admin_members am
      INNER JOIN auth.users u ON u.id = am.user_id
      ORDER BY am.created_at ASC
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_grant_member(
  p_user_id uuid,
  p_role public.admin_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller_role public.admin_role;
  v_before jsonb;
  v_after jsonb;
BEGIN
  SELECT am.role
    INTO v_caller_role
  FROM public.admin_members am
  WHERE am.user_id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'super_admin'::public.admin_role THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'user not found' USING errcode = 'P0002';
  END IF;

  SELECT jsonb_build_object('role', am.role::text)
  INTO v_before
  FROM public.admin_members am
  WHERE am.user_id = p_user_id;

  INSERT INTO public.admin_members (user_id, role, created_by)
  VALUES (p_user_id, p_role, auth.uid())
  ON CONFLICT (user_id) DO UPDATE
  SET
    role = EXCLUDED.role,
    updated_at = now(),
    created_by = auth.uid();

  v_after := jsonb_build_object('role', p_role::text);

  PERFORM public.admin_record_audit_event(
    'admin_grant_member',
    'admin_member'::public.admin_audit_entity_type,
    p_user_id,
    NULL,
    'admin-grant:' || p_user_id::text || ':' || auth.uid()::text || ':' || floor(extract(epoch from now()))::text,
    public.admin_redact_json(jsonb_build_object('before', v_before, 'after', v_after))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_member(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller_role public.admin_role;
  v_before jsonb;
BEGIN
  SELECT am.role
    INTO v_caller_role
  FROM public.admin_members am
  WHERE am.user_id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'super_admin'::public.admin_role THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING errcode = '22023';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'you cannot revoke your own administrator access' USING errcode = '55000';
  END IF;

  SELECT jsonb_build_object('role', am.role::text)
  INTO v_before
  FROM public.admin_members am
  WHERE am.user_id = p_user_id;

  DELETE FROM public.admin_members am
  WHERE am.user_id = p_user_id;

  PERFORM public.admin_record_audit_event(
    'admin_revoke_member',
    'admin_member'::public.admin_audit_entity_type,
    p_user_id,
    NULL,
    'admin-revoke:' || p_user_id::text || ':' || auth.uid()::text || ':' || floor(extract(epoch from now()))::text,
    public.admin_redact_json(jsonb_build_object('before', v_before, 'after', NULL))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_operational_issues() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_operational_issues() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_operational_issues() TO service_role;

REVOKE ALL ON FUNCTION public.admin_execute_operational_recovery(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_execute_operational_recovery(text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_execute_operational_recovery(text, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_audit_events(text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_events(text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_events(text, text, text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_get_audit_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_audit_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_audit_event(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_members() TO service_role;
