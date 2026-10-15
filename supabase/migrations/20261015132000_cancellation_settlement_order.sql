-- Settle engagement cancellation before mutating cancellation-request status so a failed
-- finalize (e.g. request already completion_pending) cannot leave a false "agreed/expired" row.

CREATE OR REPLACE FUNCTION public.respond_engagement_cancellation(
  p_request_id uuid,
  p_agree boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_request public.requests%rowtype;
  v_row public.engagement_cancellation_requests%rowtype;
  v_reason text := public.normalize_engagement_cancellation_reason(p_reason);
  v_status_key text;
  v_payment_key text;
  v_requester_id uuid;
  v_settled boolean;
BEGIN
  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'response reason must be 500 characters or fewer' USING errcode = '22023';
  END IF;

  SELECT * INTO v_request
  FROM public.requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL OR v_request.selected_user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_row
  FROM public.engagement_cancellation_requests ecr
  WHERE ecr.request_id = p_request_id
    AND ecr.status = 'pending'::public.engagement_cancellation_request_status
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'no pending cancellation request' USING errcode = '55000';
  END IF;

  IF v_row.respond_by <= now() THEN
    RAISE EXCEPTION 'this cancellation request has expired' USING errcode = '55000';
  END IF;

  v_requester_id := v_request.requester_id;

  IF p_agree THEN
    v_status_key := 'engagement_cancel:agreed:' || v_row.id::text;
    v_payment_key := 'engagement_cancel_settle:' || p_request_id::text || ':' || v_row.id::text;

    v_settled := public.finalize_engagement_cancellation(
      p_request_id,
      v_user_id,
      v_status_key,
      v_payment_key,
      'provider_agreed'::public.engagement_cancellation_event_kind,
      coalesce(v_reason, v_row.reason),
      v_row.id
    );

    IF NOT v_settled THEN
      RAISE EXCEPTION 'this engagement cannot be cancelled in its current state'
        USING errcode = '55000';
    END IF;

    UPDATE public.engagement_cancellation_requests
    SET status = 'agreed'::public.engagement_cancellation_request_status,
        resolved_at = now(),
        resolved_by = v_user_id,
        provider_response_reason = v_reason,
        settlement_idempotency_key = v_payment_key
    WHERE id = v_row.id
      AND status = 'pending'::public.engagement_cancellation_request_status;
  ELSE
    UPDATE public.engagement_cancellation_requests
    SET status = 'declined'::public.engagement_cancellation_request_status,
        resolved_at = now(),
        resolved_by = v_user_id,
        provider_response_reason = v_reason
    WHERE id = v_row.id
      AND status = 'pending'::public.engagement_cancellation_request_status;

    IF NOT FOUND THEN
      RETURN;
    END IF;

    PERFORM public.record_engagement_cancellation_event(
      p_request_id,
      v_row.id,
      v_user_id,
      'provider_declined'::public.engagement_cancellation_event_kind,
      v_reason,
      'engagement_cancel:provider_declined:' || v_row.id::text
    );

    PERFORM public.create_notification(
      v_requester_id,
      'engagement_cancel:declined:' || v_row.id::text,
      'engagement_cancellation_declined'::public.notification_type,
      'Cancellation declined',
      'Your helper declined the cancellation request. The engagement is still active.',
      format('/engagement/%s', p_request_id),
      p_request_id,
      NULL,
      NULL,
      NULL,
      v_user_id,
      jsonb_build_object('cancellation_request_id', v_row.id),
      true
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_due_engagement_cancellation_requests(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_row public.engagement_cancellation_requests%rowtype;
  v_expired_count integer := 0;
  v_status_key text;
  v_payment_key text;
  v_requester_id uuid;
  v_settled boolean;
BEGIN
  IF p_limit < 1 THEN
    RAISE EXCEPTION 'limit must be at least 1' USING errcode = '22023';
  END IF;

  FOR v_row IN
    SELECT ecr.*
    FROM public.engagement_cancellation_requests ecr
    WHERE ecr.status = 'pending'::public.engagement_cancellation_request_status
      AND ecr.respond_by <= now()
    ORDER BY ecr.respond_by
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT r.requester_id INTO v_requester_id
    FROM public.requests r
    WHERE r.id = v_row.request_id
    FOR UPDATE;

    v_status_key := 'engagement_cancel:auto:' || v_row.id::text;
    v_payment_key := 'engagement_cancel_settle:' || v_row.request_id::text || ':' || v_row.id::text;

    v_settled := public.finalize_engagement_cancellation(
      v_row.request_id,
      v_requester_id,
      v_status_key,
      v_payment_key,
      'auto_expired'::public.engagement_cancellation_event_kind,
      v_row.reason,
      v_row.id
    );

    IF NOT v_settled THEN
      CONTINUE;
    END IF;

    UPDATE public.engagement_cancellation_requests
    SET status = 'expired'::public.engagement_cancellation_request_status,
        resolved_at = now(),
        settlement_idempotency_key = v_payment_key
    WHERE id = v_row.id
      AND status = 'pending'::public.engagement_cancellation_request_status;

    IF FOUND THEN
      v_expired_count := v_expired_count + 1;
    END IF;
  END LOOP;

  RETURN v_expired_count;
END;
$$;
