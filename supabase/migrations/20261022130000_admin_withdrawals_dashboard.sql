-- Admin withdrawals dashboard: overview metrics, filtered queue, detail bundle, audited account reveal.

CREATE OR REPLACE FUNCTION public.admin_get_withdrawals_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_pending_count integer;
  v_processing_count integer;
  v_completed_today_count integer;
  v_outstanding_kobo bigint;
  v_today_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos';
BEGIN
  PERFORM public.admin_require_permission('withdrawals');

  SELECT count(*)::int
  INTO v_pending_count
  FROM public.wallet_withdrawals w
  WHERE w.status = 'pending'::public.wallet_withdrawal_status;

  SELECT count(*)::int
  INTO v_processing_count
  FROM public.wallet_withdrawals w
  WHERE w.status = 'processing'::public.wallet_withdrawal_status;

  SELECT count(*)::int
  INTO v_completed_today_count
  FROM public.wallet_withdrawals w
  WHERE w.status = 'completed'::public.wallet_withdrawal_status
    AND w.completed_at >= v_today_start;

  SELECT coalesce(sum(w.amount_kobo), 0)::bigint
  INTO v_outstanding_kobo
  FROM public.wallet_withdrawals w
  WHERE w.status IN (
    'pending'::public.wallet_withdrawal_status,
    'processing'::public.wallet_withdrawal_status
  );

  RETURN jsonb_build_object(
    'metrics', jsonb_build_object(
      'pending_count', v_pending_count,
      'processing_count', v_processing_count,
      'completed_today_count', v_completed_today_count,
      'outstanding_total_kobo', v_outstanding_kobo
    ),
    'definitions', jsonb_build_object(
      'pending_count', 'Withdrawals awaiting admin review (status pending).',
      'processing_count', 'Withdrawals approved for manual bank transfer (status processing).',
      'completed_today_count', 'Withdrawals marked completed since midnight Africa/Lagos.',
      'outstanding_total_kobo', 'Sum of amount_kobo for pending and processing withdrawals (reserved funds).'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_withdrawals_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_withdrawals_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_withdrawals_overview() TO service_role;

DROP FUNCTION IF EXISTS public.admin_list_withdrawals(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_list_withdrawals(
  p_query text DEFAULT '',
  p_status text DEFAULT 'all',
  p_submitted_from timestamptz DEFAULT NULL,
  p_submitted_to timestamptz DEFAULT NULL,
  p_amount_min_kobo bigint DEFAULT NULL,
  p_amount_max_kobo bigint DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
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
  v_status text := coalesce(btrim(p_status), 'all');
BEGIN
  PERFORM public.admin_require_permission('withdrawals');

  SELECT count(*)::int
  INTO v_total
  FROM public.wallet_withdrawals w
  INNER JOIN public.profiles p ON p.id = w.user_id
  WHERE (
    v_q = ''
    OR w.id::text ILIKE '%' || v_q || '%'
    OR w.idempotency_key ILIKE '%' || v_q || '%'
    OR coalesce(w.bank_transfer_reference, '') ILIKE '%' || v_q || '%'
    OR w.user_id::text ILIKE '%' || v_q || '%'
    OR coalesce(p.display_name, '') ILIKE '%' || v_q || '%'
    OR w.wallet_transaction_id::text ILIKE '%' || v_q || '%'
  )
  AND (v_status = 'all' OR w.status::text = v_status)
  AND (p_submitted_from IS NULL OR w.created_at >= p_submitted_from)
  AND (p_submitted_to IS NULL OR w.created_at <= p_submitted_to)
  AND (p_amount_min_kobo IS NULL OR w.amount_kobo >= p_amount_min_kobo)
  AND (p_amount_max_kobo IS NULL OR w.amount_kobo <= p_amount_max_kobo)
  AND (p_user_id IS NULL OR w.user_id = p_user_id);

  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      w.id,
      w.idempotency_key AS reference,
      w.user_id,
      p.display_name AS user_name,
      w.amount_kobo AS amount,
      w.status::text AS status,
      w.destination_bank_name,
      public.mask_bank_account_number(w.destination_account_number) AS destination_account_number_masked,
      w.destination_account_name,
      w.wallet_transaction_id,
      w.created_at,
      w.updated_at
    FROM public.wallet_withdrawals w
    INNER JOIN public.profiles p ON p.id = w.user_id
    WHERE (
      v_q = ''
      OR w.id::text ILIKE '%' || v_q || '%'
      OR w.idempotency_key ILIKE '%' || v_q || '%'
      OR coalesce(w.bank_transfer_reference, '') ILIKE '%' || v_q || '%'
      OR w.user_id::text ILIKE '%' || v_q || '%'
      OR coalesce(p.display_name, '') ILIKE '%' || v_q || '%'
      OR w.wallet_transaction_id::text ILIKE '%' || v_q || '%'
    )
    AND (v_status = 'all' OR w.status::text = v_status)
    AND (p_submitted_from IS NULL OR w.created_at >= p_submitted_from)
    AND (p_submitted_to IS NULL OR w.created_at <= p_submitted_to)
    AND (p_amount_min_kobo IS NULL OR w.amount_kobo >= p_amount_min_kobo)
    AND (p_amount_max_kobo IS NULL OR w.amount_kobo <= p_amount_max_kobo)
    AND (p_user_id IS NULL OR w.user_id = p_user_id)
    ORDER BY w.created_at DESC
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

REVOKE ALL ON FUNCTION public.admin_list_withdrawals(
  text, text, timestamptz, timestamptz, bigint, bigint, uuid, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_withdrawals(
  text, text, timestamptz, timestamptz, bigint, bigint, uuid, integer, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_withdrawals(
  text, text, timestamptz, timestamptz, bigint, bigint, uuid, integer, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_get_wallet_withdrawal_detail(p_withdrawal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_row public.wallet_withdrawals%rowtype;
  v_user_name text;
  v_user_phone text;
  v_audit jsonb;
  v_timeline jsonb;
  v_risk jsonb;
BEGIN
  PERFORM public.admin_require_permission('withdrawals');

  SELECT * INTO v_row
  FROM public.wallet_withdrawals w
  WHERE w.id = p_withdrawal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal not found' USING errcode = 'P0002';
  END IF;

  SELECT p.display_name, p.phone
    INTO v_user_name, v_user_phone
  FROM public.profiles p
  WHERE p.id = v_row.user_id;

  SELECT coalesce(jsonb_agg(row_to_json(a) ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO v_audit
  FROM (
    SELECT
      ev.id,
      ev.action,
      ev.reason,
      public.admin_redact_json(ev.metadata) AS metadata,
      ev.idempotency_key,
      ev.actor_admin_id,
      ev.created_at
    FROM public.admin_audit_events ev
    WHERE ev.entity_type = 'wallet_withdrawal'::public.admin_audit_entity_type
      AND ev.entity_id = v_row.id
    ORDER BY ev.created_at DESC
    LIMIT 50
  ) a;

  v_timeline := jsonb_build_array(
    jsonb_build_object('event', 'submitted', 'at', v_row.created_at)
  );

  IF v_row.approved_at IS NOT NULL THEN
    v_timeline := v_timeline || jsonb_build_array(
      jsonb_build_object('event', 'approved_for_processing', 'at', v_row.approved_at, 'by', v_row.approved_by)
    );
  END IF;

  IF v_row.processing_at IS NOT NULL THEN
    v_timeline := v_timeline || jsonb_build_array(
      jsonb_build_object('event', 'processing', 'at', v_row.processing_at, 'by', v_row.processing_by)
    );
  END IF;

  IF v_row.completed_at IS NOT NULL THEN
    v_timeline := v_timeline || jsonb_build_array(
      jsonb_build_object('event', 'completed', 'at', v_row.completed_at, 'by', v_row.completed_by)
    );
  END IF;

  IF v_row.rejected_at IS NOT NULL THEN
    v_timeline := v_timeline || jsonb_build_array(
      jsonb_build_object('event', 'rejected', 'at', v_row.rejected_at, 'by', v_row.rejected_by)
    );
  END IF;

  IF v_row.failed_at IS NOT NULL THEN
    v_timeline := v_timeline || jsonb_build_array(
      jsonb_build_object('event', 'failed', 'at', v_row.failed_at, 'by', v_row.failed_by)
    );
  END IF;

  SELECT jsonb_build_object(
    'marketplace_listing_restricted', EXISTS (
      SELECT 1
      FROM public.user_account_restrictions uar
      WHERE uar.user_id = v_row.user_id
        AND uar.lifted_at IS NULL
        AND uar.scope = 'new_marketplace_listings'::public.user_restriction_scope
    )
  )
  INTO v_risk;

  RETURN jsonb_build_object(
    'withdrawal', jsonb_build_object(
      'id', v_row.id,
      'reference', v_row.idempotency_key,
      'user_id', v_row.user_id,
      'user_name', v_user_name,
      'user_phone', v_user_phone,
      'amount_kobo', v_row.amount_kobo,
      'currency', v_row.currency,
      'status', v_row.status::text,
      'bank_account_id', v_row.bank_account_id,
      'destination_bank_code', v_row.destination_bank_code,
      'destination_bank_name', v_row.destination_bank_name,
      'destination_account_number_masked', public.mask_bank_account_number(v_row.destination_account_number),
      'destination_account_name', v_row.destination_account_name,
      'user_facing_reason', v_row.user_facing_reason,
      'admin_notes', v_row.admin_notes,
      'bank_transfer_reference', v_row.bank_transfer_reference,
      'wallet_transaction_id', v_row.wallet_transaction_id,
      'release_transaction_id', v_row.release_transaction_id,
      'created_at', v_row.created_at,
      'updated_at', v_row.updated_at,
      'approved_at', v_row.approved_at,
      'processing_at', v_row.processing_at,
      'completed_at', v_row.completed_at,
      'rejected_at', v_row.rejected_at,
      'failed_at', v_row.failed_at
    ),
    'audit_events', v_audit,
    'timeline', v_timeline,
    'risk', v_risk,
    'manual_transfer_notice', 'Active does not send bank transfers automatically. Send payment via your approved external banking channel, then record the outcome here.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_wallet_withdrawal_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_wallet_withdrawal_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_wallet_withdrawal_detail(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_reveal_wallet_withdrawal_account(
  p_withdrawal_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_row public.wallet_withdrawals%rowtype;
  v_key text := btrim(p_idempotency_key);
BEGIN
  PERFORM public.admin_require_permission('withdrawals');

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.wallet_withdrawals w
  WHERE w.id = p_withdrawal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal not found' USING errcode = 'P0002';
  END IF;

  PERFORM public.admin_record_audit_event(
    'wallet_withdrawal_reveal_account',
    'wallet_withdrawal'::public.admin_audit_entity_type,
    v_row.id,
    NULL,
    v_key,
    jsonb_build_object('withdrawal_id', v_row.id)
  );

  RETURN jsonb_build_object(
    'destination_account_number', v_row.destination_account_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reveal_wallet_withdrawal_account(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reveal_wallet_withdrawal_account(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reveal_wallet_withdrawal_account(uuid, text) TO service_role;
