-- Keep alternative provider responses pending while one engagement is active.

CREATE OR REPLACE FUNCTION public.list_request_responses(p_request_id uuid)
RETURNS TABLE(
  response_id uuid,
  responder_id uuid,
  display_name text,
  avatar_path text,
  bio text,
  rating_average numeric,
  rating_count integer,
  jobs_completed integer,
  completion_percent integer,
  phone_verified boolean,
  message text,
  quoted_amount numeric,
  distance_m integer,
  status public.response_status,
  created_at timestamp with time zone,
  expires_at timestamp with time zone,
  responder_available boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    rr.id,
    rr.responder_id,
    p.display_name,
    p.avatar_path,
    p.bio,
    p.rating_average,
    p.rating_count,
    p.jobs_completed,
    public.provider_completion_percent(p.id) AS completion_percent,
    p.phone IS NOT NULL AS phone_verified,
    rr.message,
    rr.quoted_amount,
    rr.distance_m,
    rr.status,
    rr.created_at,
    rr.expires_at,
    NOT public.provider_selection_conflicts(rr.responder_id, r.id) AS responder_available
  FROM public.requests r
  JOIN public.request_responses rr ON rr.request_id = r.id
  JOIN public.profiles p ON p.id = rr.responder_id
  WHERE r.id = p_request_id
    AND r.requester_id = public.assert_authenticated()
    AND rr.status IN (
      'pending'::public.response_status,
      'accepted'::public.response_status,
      'withdrawn'::public.response_status,
      'declined'::public.response_status
    )
  ORDER BY
    CASE rr.status
      WHEN 'accepted'::public.response_status THEN 0
      WHEN 'pending'::public.response_status THEN 1
      WHEN 'declined'::public.response_status THEN 2
      ELSE 3
    END,
    rr.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.finalize_engagement_cancellation(
  p_request_id uuid,
  p_actor_id uuid,
  p_status_event_key text,
  p_payment_idempotency_key text,
  p_event_kind public.engagement_cancellation_event_kind,
  p_reason text,
  p_cancellation_request_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request public.requests%rowtype;
  v_from_status public.request_status;
  v_to_status public.request_status;
  v_payment public.payment_status;
  v_selected_user_id uuid;
  v_accepted_response_id uuid;
  v_requester_id uuid;
  v_reopen_key text;
BEGIN
  IF p_status_event_key IS NULL OR btrim(p_status_event_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  IF p_payment_idempotency_key IS NULL OR btrim(p_payment_idempotency_key) = '' THEN
    RAISE EXCEPTION 'payment idempotency key is required' USING errcode = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.engagement_cancellation_events e
    WHERE e.idempotency_key = p_status_event_key
  ) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_request
  FROM public.requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  v_from_status := v_request.status;
  v_payment := v_request.payment_status;
  v_selected_user_id := v_request.selected_user_id;
  v_accepted_response_id := v_request.accepted_response_id;
  v_requester_id := v_request.requester_id;

  IF v_from_status NOT IN (
    'accepted'::public.request_status,
    'in_progress'::public.request_status
  ) THEN
    RETURN false;
  END IF;

  v_to_status := CASE
    WHEN v_request.expires_at IS NOT NULL AND v_request.expires_at <= now()
      THEN 'awaiting_review'::public.request_status
    ELSE 'posted'::public.request_status
  END;

  IF v_payment IN ('locked'::public.payment_status, 'pending'::public.payment_status) THEN
    PERFORM public.apply_payment_transition(
      p_request_id,
      'refunded'::public.payment_status,
      p_payment_idempotency_key
    );
  END IF;

  v_reopen_key := p_payment_idempotency_key || ':reopen';

  IF (
    SELECT payment_status
    FROM public.requests
    WHERE id = p_request_id
  ) = 'refunded'::public.payment_status THEN
    PERFORM public.apply_payment_transition(
      p_request_id,
      'not_required'::public.payment_status,
      v_reopen_key
    );
  END IF;

  IF v_accepted_response_id IS NOT NULL THEN
    UPDATE public.request_responses rr
    SET status = 'withdrawn'::public.response_status,
        resolved_at = coalesce(rr.resolved_at, now())
    WHERE rr.id = v_accepted_response_id
      AND rr.status = 'accepted'::public.response_status;
  END IF;

  UPDATE public.requests
  SET status = v_to_status,
      selected_user_id = NULL,
      accepted_response_id = NULL,
      accepted_at = NULL,
      started_at = NULL,
      completion_confirm_by = NULL,
      cancelled_at = NULL
  WHERE id = p_request_id;

  PERFORM public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_from_status,
    v_to_status,
    p_status_event_key
  );

  PERFORM public.record_engagement_cancellation_event(
    p_request_id,
    p_cancellation_request_id,
    p_actor_id,
    p_event_kind,
    p_reason,
    p_status_event_key
  );

  IF v_selected_user_id IS NOT NULL THEN
    PERFORM public.release_provider(v_selected_user_id);
  END IF;

  IF p_event_kind = 'provider_immediate'::public.engagement_cancellation_event_kind THEN
    PERFORM public.create_notification(
      v_requester_id,
      p_status_event_key || ':requester',
      'helper_cancelled'::public.notification_type,
      'Helper cancelled',
      'The person helping you cancelled. Your payment has been returned and you can choose someone else.',
      format('/request/%s', p_request_id),
      p_request_id,
      v_accepted_response_id,
      NULL,
      NULL,
      p_actor_id,
      NULL,
      true
    );
  ELSIF p_event_kind IN (
    'provider_agreed'::public.engagement_cancellation_event_kind,
    'auto_expired'::public.engagement_cancellation_event_kind
  ) THEN
    PERFORM public.create_notification(
      v_requester_id,
      p_status_event_key || ':requester',
      'cancellation_confirmed'::public.notification_type,
      'Cancellation confirmed',
      'Your cancellation was confirmed. Payment has been returned and you can choose another helper.',
      format('/request/%s', p_request_id),
      p_request_id,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      true
    );

    IF v_selected_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        v_selected_user_id,
        p_status_event_key || ':provider',
        'request_cancelled'::public.notification_type,
        'Request cancelled',
        'The person who posted this request cancelled the engagement. You can respond to other requests.',
        format('/respond/%s', p_request_id),
        p_request_id,
        NULL,
        NULL,
        NULL,
        v_requester_id,
        jsonb_build_object('link', 'respond'),
        true
      );
    END IF;

    PERFORM public.create_notification(
      v_requester_id,
      p_status_event_key || ':funds',
      'funds_returned'::public.notification_type,
      'Funds returned',
      'Held payment for this request was returned to your wallet.',
      '/wallet',
      p_request_id,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      true
    );
  END IF;

  RETURN true;
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

  IF EXISTS (
    SELECT 1
    FROM public.engagement_cancellation_requests ecr
    WHERE ecr.request_id = v_request_id
      AND ecr.status = 'pending'::public.engagement_cancellation_request_status
  ) THEN
    RAISE EXCEPTION 'this request has a pending cancellation' USING errcode = '55000';
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
