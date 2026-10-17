-- Retire engagement cancellation entry points. Historical rows in
-- engagement_cancellation_requests / engagement_cancellation_events are preserved.

-- Close any in-flight consent flows without settling (engagement continues; use report/dispute).
UPDATE public.engagement_cancellation_requests
SET status = 'superseded'::public.engagement_cancellation_request_status,
    resolved_at = coalesce(resolved_at, now())
WHERE status = 'pending'::public.engagement_cancellation_request_status;

DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'expire-engagement-cancellation-requests';
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
    RAISE NOTICE 'pg_cron unschedule for engagement cancellation expiry was not applied';
END;
$schedule$;

CREATE OR REPLACE FUNCTION public.cancel_request(p_request_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_requester_id uuid;
  v_status public.request_status;
BEGIN
  SELECT r.requester_id, r.status
    INTO v_requester_id, v_status
  FROM public.requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_requester_id <> v_user_id THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_status = 'completion_pending' THEN
    RAISE EXCEPTION 'you cannot cancel while completion is being confirmed'
      USING errcode = '55000';
  END IF;

  IF v_status IN (
    'accepted'::public.request_status,
    'in_progress'::public.request_status
  ) THEN
    RAISE EXCEPTION 'this request cannot be cancelled while someone is helping'
      USING errcode = '55000';
  END IF;

  PERFORM public.finalize_request_cancellation(
    p_request_id,
    v_user_id,
    'cancel_request:' || p_request_id::text,
    'cancel:' || p_request_id::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_service(p_request_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'active engagements cannot be ended through cancel; report an issue instead'
    USING errcode = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_service_complete(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_status public.request_status;
BEGIN
  SELECT status INTO v_status
  FROM public.requests
  WHERE id = p_request_id AND selected_user_id = v_user_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_status IN ('completion_pending', 'completed') THEN
    RETURN;
  END IF;

  IF v_status NOT IN ('accepted', 'in_progress') THEN
    RAISE EXCEPTION 'only an active job can be marked complete' USING errcode = '55000';
  END IF;

  UPDATE public.requests
  SET status = 'completion_pending'::public.request_status,
      completion_confirm_by = now() + public.completion_confirmation_interval()
  WHERE id = p_request_id;

  PERFORM public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'completion_pending'::public.request_status,
    'mark_complete:' || p_request_id::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_response(p_response_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_request_id uuid;
  v_selected_user_id uuid;
  v_request_status public.request_status;
  v_response_status public.response_status;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_request_expires_at timestamptz;
  v_offered_amount numeric;
  v_quoted_amount numeric;
  v_agreed_provider_amount numeric;
  v_accepted uuid;
  v_locked_request_id uuid;
  v_requester_name text;
  v_requester_first text;
  v_handshake_key text;
BEGIN
  SELECT rr.request_id
    INTO v_request_id
  FROM public.request_responses rr
  JOIN public.requests r ON r.id = rr.request_id
  WHERE rr.id = p_response_id
    AND r.requester_id = v_user_id;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'response not found' USING errcode = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.handshakes h
    JOIN public.requests r ON r.id = h.request_id
    WHERE h.request_id = v_request_id
      AND h.response_id = p_response_id
      AND r.accepted_response_id = p_response_id
      AND r.selected_user_id IS NOT NULL
      AND r.status = ANY (
        ARRAY[
          'accepted'::public.request_status,
          'in_progress'::public.request_status,
          'completion_pending'::public.request_status,
          'disputed'::public.request_status
        ]
      )
  ) THEN
    RETURN v_request_id;
  END IF;

  SELECT r.status, r.payment_status, r.requester_id, r.expires_at, r.offered_amount
    INTO v_request_status, v_payment, v_requester_id, v_request_expires_at, v_offered_amount
  FROM public.requests r
  WHERE r.id = v_request_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.requests r
    WHERE r.id = v_request_id
      AND r.selected_user_id IS NOT NULL
      AND r.status = ANY (public.attending_request_statuses())
  ) THEN
    RAISE EXCEPTION 'someone is already helping on this request' USING errcode = '55000';
  END IF;

  IF v_request_status NOT IN (
    'posted'::public.request_status,
    'awaiting_review'::public.request_status
  ) THEN
    RAISE EXCEPTION 'this request is no longer open for selection' USING errcode = '55000';
  END IF;

  IF v_request_status = 'posted'::public.request_status
     AND v_request_expires_at IS NOT NULL
     AND v_request_expires_at > now() THEN
    NULL;
  ELSIF v_request_status = 'awaiting_review'::public.request_status
     OR (
       v_request_status = 'posted'::public.request_status
       AND v_request_expires_at IS NOT NULL
       AND v_request_expires_at <= now()
     ) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'this request is no longer open for selection' USING errcode = '55000';
  END IF;

  SELECT rr.request_id, rr.responder_id, rr.status, rr.quoted_amount
    INTO v_locked_request_id, v_selected_user_id, v_response_status, v_quoted_amount
  FROM public.request_responses rr
  WHERE rr.id = p_response_id
  FOR UPDATE;

  IF v_locked_request_id IS DISTINCT FROM v_request_id
     OR v_response_status IS DISTINCT FROM 'pending'::public.response_status THEN
    RAISE EXCEPTION 'this response is no longer available' USING errcode = '55000';
  END IF;

  v_agreed_provider_amount := coalesce(nullif(v_quoted_amount, 0), v_offered_amount);

  IF v_agreed_provider_amount IS NULL OR v_agreed_provider_amount <= 0 THEN
    RAISE EXCEPTION 'this request has no agreed payment amount' USING errcode = '55000';
  END IF;

  PERFORM pg_advisory_xact_lock(4242, hashtext(v_selected_user_id::text));

  PERFORM 1
  FROM public.requests existing
  WHERE existing.selected_user_id = v_selected_user_id
    AND existing.status = ANY (public.attending_request_statuses())
  FOR UPDATE;

  PERFORM public.assert_responder_available_for_selection(v_selected_user_id, v_request_id);

  v_handshake_key := 'handshake:' || v_request_id::text || ':' || p_response_id::text;

  IF v_payment = 'not_required'::public.payment_status THEN
    PERFORM public.lock_request_escrow_for_amount(
      v_request_id,
      v_agreed_provider_amount,
      v_handshake_key
    );
  ELSIF v_payment = 'locked'::public.payment_status THEN
    PERFORM public.align_request_escrow_to_agreed_amount(
      v_request_id,
      v_agreed_provider_amount,
      v_handshake_key
    );
  ELSE
    RAISE EXCEPTION 'this request cannot be accepted for payment' USING errcode = '55000';
  END IF;

  UPDATE public.request_responses
  SET status = 'accepted', resolved_at = now()
  WHERE id = p_response_id
    AND status = 'pending'
  RETURNING id INTO v_accepted;

  IF v_accepted IS NULL THEN
    RAISE EXCEPTION 'this response is no longer available' USING errcode = '55000';
  END IF;

  UPDATE public.requests
  SET status = 'accepted',
      accepted_at = now(),
      accepted_response_id = p_response_id,
      selected_user_id = v_selected_user_id,
      agreed_provider_amount = v_agreed_provider_amount
  WHERE id = v_request_id
    AND status IN (
      'posted'::public.request_status,
      'awaiting_review'::public.request_status
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'this request is no longer open for selection' USING errcode = '55000';
  END IF;

  PERFORM public.set_user_attendance(v_selected_user_id, v_request_id);

  INSERT INTO public.handshakes (request_id, response_id, requester_id, selected_user_id)
  VALUES (v_request_id, p_response_id, v_requester_id, v_selected_user_id);

  PERFORM public.ensure_request_conversation(
    v_request_id,
    v_requester_id,
    v_selected_user_id,
    p_response_id
  );

  SELECT p.display_name
    INTO v_requester_name
  FROM public.profiles p
  WHERE p.id = v_requester_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'them');

  PERFORM public.create_notification(
    v_selected_user_id,
    'request:' || v_request_id::text || ':accepted',
    'response_accepted'::public.notification_type,
    format('You''re helping %s now', v_requester_first),
    'Open the request to chat, see contact details, and where to meet.',
    format('/engagement/%s', v_request_id),
    v_request_id,
    p_response_id,
    NULL,
    NULL,
    v_requester_id,
    NULL,
    true
  );

  PERFORM public.apply_payment_transition(
    v_request_id,
    'pending'::public.payment_status,
    v_handshake_key
  );

  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_type_should_push(
  p_type public.notification_type
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT p_type = ANY (
    ARRAY[
      'response_received'::public.notification_type,
      'new_responses'::public.notification_type,
      'request_expiring'::public.notification_type,
      'request_expired'::public.notification_type,
      'request_awaiting_review'::public.notification_type,
      'response_accepted'::public.notification_type,
      'response_not_selected'::public.notification_type,
      'completion_requested'::public.notification_type,
      'payment_secured'::public.notification_type,
      'funds_returned'::public.notification_type,
      'payment_released'::public.notification_type,
      'payment_received'::public.notification_type,
      'withdrawal_processing'::public.notification_type,
      'withdrawal_successful'::public.notification_type,
      'withdrawal_failed'::public.notification_type,
      'new_message'::public.notification_type,
      'missed_call'::public.notification_type,
      'request_cancelled'::public.notification_type,
      'helper_cancelled'::public.notification_type,
      'cancellation_confirmed'::public.notification_type,
      'problem_reported'::public.notification_type,
      'dispute_opened'::public.notification_type,
      'dispute_resolved'::public.notification_type,
      'funds_released_after_resolution'::public.notification_type,
      'rate_experience'::public.notification_type
    ]
  );
$$;

REVOKE ALL ON FUNCTION public.cancel_engagement_as_provider(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_engagement_cancellation(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_engagement_cancellation(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_engagement_cancellation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_engagement_cancellation_events(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_due_engagement_cancellation_requests(integer) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.cancel_engagement_as_provider(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.request_engagement_cancellation(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.respond_engagement_cancellation(uuid, boolean, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_engagement_cancellation(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.list_engagement_cancellation_events(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_due_engagement_cancellation_requests(integer) FROM service_role;

REVOKE ALL ON FUNCTION public.cancel_service(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_service(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_service(uuid, text) TO service_role;
