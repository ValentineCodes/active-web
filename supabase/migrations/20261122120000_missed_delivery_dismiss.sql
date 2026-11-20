-- Missed-delivery dismissal (distinct from failure-to-start). UD-21 gates live dismiss.

COMMENT ON TYPE public.request_status IS
  'Stored lifecycle: posted, accepted, in_progress, completion_pending, completed, cancelled (incl. missed-delivery dismiss), expired, disputed, no_show (failure-to-start dismiss), draft.';

-- UD-21: Returns NULL until product approves which actions count as qualifying deliverables.
CREATE OR REPLACE FUNCTION public.request_qualifying_deliverable_submitted_before_deadline(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Chat messages and unapproved paths must not count until UD-21 is closed.
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.request_qualifying_deliverable_submitted_before_deadline(uuid) IS
  'UD-21: NULL = not configured; true/false when rules are approved.';

CREATE OR REPLACE FUNCTION public.wallet_refund_remaining_escrow_kobo(
  p_reference text,
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_lock public.payment_locks%rowtype;
  v_remaining_total bigint;
  v_refund_ref text;
BEGIN
  IF p_reference IS NULL OR btrim(p_reference) = '' THEN
    RAISE EXCEPTION 'reference is required' USING errcode = '22023';
  END IF;

  v_refund_ref := p_reference || ':refund';

  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions wt WHERE wt.reference = v_refund_ref
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_lock
  FROM public.payment_locks pl
  WHERE pl.request_id = p_request_id
  FOR UPDATE;

  IF v_lock.request_id IS NULL THEN
    RETURN;
  END IF;

  IF v_lock.status = 'refunded'::public.payment_lock_status THEN
    RETURN;
  END IF;

  IF v_lock.status <> 'active'::public.payment_lock_status THEN
    RAISE EXCEPTION 'payment lock is not refundable' USING errcode = '55000';
  END IF;

  v_remaining_total := v_lock.total - v_lock.released_total_kobo;

  IF v_remaining_total > 0 THEN
    PERFORM public.wallet_apply_entry(
      v_refund_ref,
      v_lock.user_id,
      p_request_id,
      'refund'::public.wallet_transaction_type,
      v_remaining_total,
      -v_remaining_total,
      'Remaining escrow returned to wallet',
      jsonb_build_object(
        'legacy_kind', 'refund',
        'released_total_kobo', v_lock.released_total_kobo,
        'refunded_remaining_kobo', v_remaining_total
      )
    );
  END IF;

  UPDATE public.payment_locks
  SET status = 'refunded'::public.payment_lock_status
  WHERE request_id = p_request_id
    AND status = 'active'::public.payment_lock_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_wallet_payment_transition(
  p_request_id uuid,
  p_from public.payment_status,
  p_to public.payment_status,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_selected_user_id uuid;
  v_structure public.payment_structure;
  v_lock_status public.payment_lock_status;
  v_released_total bigint;
  v_lock_total bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.payment_locks pl WHERE pl.request_id = p_request_id) THEN
    RETURN;
  END IF;

  SELECT r.selected_user_id, r.payment_structure
    INTO v_selected_user_id, v_structure
  FROM public.requests r
  WHERE r.id = p_request_id;

  IF p_from = 'locked' AND p_to = 'pending' THEN
    PERFORM public.wallet_shift_lock_bucket(
      p_idempotency_key || ':escrow_pending',
      p_request_id,
      'pending'::public.payment_lock_bucket
    );
  ELSIF p_from = 'pending' AND p_to = 'released' THEN
    SELECT pl.status, pl.released_total_kobo, pl.total
      INTO v_lock_status, v_released_total, v_lock_total
    FROM public.payment_locks pl
    WHERE pl.request_id = p_request_id;

    IF v_structure = 'milestone'::public.payment_structure
       AND v_lock_status = 'released'::public.payment_lock_status
       AND v_released_total >= v_lock_total THEN
      NULL;
    ELSE
      PERFORM public.wallet_release_lock_kobo(
        p_idempotency_key,
        p_request_id,
        v_selected_user_id
      );
    END IF;
  ELSIF p_from = 'locked' AND p_to = 'refunded' THEN
    PERFORM public.wallet_refund_remaining_escrow_kobo(p_idempotency_key, p_request_id);
  ELSIF p_from = 'pending' AND p_to = 'refunded' THEN
    PERFORM public.wallet_refund_remaining_escrow_kobo(p_idempotency_key, p_request_id);
  ELSIF p_from = 'disputed' AND p_to = 'released' THEN
    SELECT pl.status, pl.released_total_kobo, pl.total
      INTO v_lock_status, v_released_total, v_lock_total
    FROM public.payment_locks pl
    WHERE pl.request_id = p_request_id;

    IF v_structure = 'milestone'::public.payment_structure
       AND v_lock_status = 'released'::public.payment_lock_status
       AND v_released_total >= v_lock_total THEN
      NULL;
    ELSE
      PERFORM public.wallet_release_lock_kobo(
        p_idempotency_key,
        p_request_id,
        v_selected_user_id
      );
    END IF;
  ELSIF p_from = 'disputed' AND p_to = 'refunded' THEN
    PERFORM public.wallet_refund_remaining_escrow_kobo(p_idempotency_key, p_request_id);
  ELSIF p_from = 'disputed' AND p_to = 'pending' THEN
    PERFORM public.wallet_shift_lock_bucket(
      p_idempotency_key || ':escrow_pending',
      p_request_id,
      'pending'::public.payment_lock_bucket
    );
  ELSIF p_from = 'disputed' AND p_to = 'locked' THEN
    PERFORM public.wallet_shift_lock_bucket(
      p_idempotency_key || ':escrow_relock',
      p_request_id,
      'locked'::public.payment_lock_bucket
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_worker_missed_delivery(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_status public.request_status;
  v_payment public.payment_status;
  v_started_at timestamptz;
  v_delivery_deadline_at timestamptz;
  v_payment_key text;
  v_qualifying_deliverable boolean;
  v_helper_name text;
  v_helper_first text;
BEGIN
  v_payment_key := 'dismiss_missed_delivery:' || p_request_id::text;

  SELECT
    r.requester_id,
    r.selected_user_id,
    r.status,
    r.payment_status,
    r.started_at,
    r.delivery_deadline_at
    INTO v_requester_id,
         v_selected_user_id,
         v_status,
         v_payment,
         v_started_at,
         v_delivery_deadline_at
  FROM public.requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_requester_id <> v_user_id THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_status = 'cancelled'::public.request_status AND v_payment = 'refunded'::public.payment_status THEN
    RETURN;
  END IF;

  IF v_status = 'cancelled'::public.request_status THEN
    RETURN;
  END IF;

  IF v_status = 'completed'::public.request_status THEN
    RAISE EXCEPTION 'a completed request cannot be dismissed' USING errcode = '55000';
  END IF;

  IF v_status = 'no_show'::public.request_status THEN
    RAISE EXCEPTION 'this request cannot be dismissed for missed delivery' USING errcode = '55000';
  END IF;

  IF v_status = 'disputed'::public.request_status OR v_payment = 'disputed'::public.payment_status THEN
    RAISE EXCEPTION 'this request is disputed' USING errcode = '55000';
  END IF;

  IF v_status <> 'in_progress'::public.request_status THEN
    RAISE EXCEPTION 'this request cannot be dismissed for missed delivery' USING errcode = '55000';
  END IF;

  IF v_started_at IS NULL THEN
    RAISE EXCEPTION 'work has not started' USING errcode = '55000';
  END IF;

  IF v_delivery_deadline_at IS NULL THEN
    RAISE EXCEPTION 'delivery deadline is not set' USING errcode = '55000';
  END IF;

  IF now() < v_delivery_deadline_at THEN
    RAISE EXCEPTION 'the delivery deadline has not passed yet' USING errcode = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.service_problems sp
    WHERE sp.request_id = p_request_id
      AND sp.status = 'open'
  ) THEN
    RAISE EXCEPTION 'this request has an open report' USING errcode = '55000';
  END IF;

  v_qualifying_deliverable := public.request_qualifying_deliverable_submitted_before_deadline(p_request_id);

  IF v_qualifying_deliverable IS NULL THEN
    RAISE EXCEPTION
      'missed-delivery dismissal is not available until qualifying deliverable rules are approved (UD-21)'
      USING errcode = 'P0001';
  END IF;

  IF v_qualifying_deliverable THEN
    RAISE EXCEPTION 'a qualifying deliverable was submitted before the deadline' USING errcode = '55000';
  END IF;

  UPDATE public.request_responses
  SET status = 'declined'::public.response_status,
      resolved_at = coalesce(resolved_at, now())
  WHERE request_id = p_request_id
    AND status = 'accepted'::public.response_status;

  UPDATE public.requests
  SET status = 'cancelled'::public.request_status,
      completion_confirm_by = NULL
  WHERE id = p_request_id;

  PERFORM public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'cancelled'::public.request_status,
    'dismiss_missed_delivery:' || p_request_id::text
  );

  IF v_payment IN ('locked', 'pending') THEN
    PERFORM public.apply_payment_transition(
      p_request_id,
      'refunded'::public.payment_status,
      v_payment_key
    );
  END IF;

  IF v_selected_user_id IS NOT NULL THEN
    PERFORM public.release_provider(v_selected_user_id);

    SELECT p.display_name INTO v_helper_name
    FROM public.profiles p
    WHERE p.id = v_selected_user_id;

    v_helper_first := coalesce(public.display_first_name(v_helper_name), 'the helper');

    PERFORM public.create_notification(
      v_selected_user_id,
      'request:' || p_request_id::text || ':dismissed_missed_delivery',
      'response_accepted'::public.notification_type,
      'Engagement ended',
      format('%s ended the engagement because the delivery deadline was missed.', 'The requester'),
      format('/engagement/%s', p_request_id),
      p_request_id,
      NULL,
      NULL,
      NULL,
      v_requester_id,
      NULL,
      true
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.request_qualifying_deliverable_submitted_before_deadline(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_qualifying_deliverable_submitted_before_deadline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_qualifying_deliverable_submitted_before_deadline(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.wallet_refund_remaining_escrow_kobo(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_refund_remaining_escrow_kobo(text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.sync_wallet_payment_transition(uuid, public.payment_status, public.payment_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_wallet_payment_transition(uuid, public.payment_status, public.payment_status, text) TO service_role;

REVOKE ALL ON FUNCTION public.dismiss_worker_missed_delivery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_worker_missed_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_worker_missed_delivery(uuid) TO service_role;