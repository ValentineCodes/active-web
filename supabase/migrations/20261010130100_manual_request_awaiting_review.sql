-- Manual request expiry: response window closes into awaiting_review; owner extends or expires.

CREATE OR REPLACE FUNCTION public.request_in_awaiting_review(
  p_status public.request_status,
  p_expires_at timestamp with time zone
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT
    p_status = 'awaiting_review'::public.request_status
    OR (
      p_status = 'posted'::public.request_status
      AND p_expires_at IS NOT NULL
      AND p_expires_at <= now()
    );
$$;

CREATE OR REPLACE FUNCTION public.request_effective_status(
  p_status public.request_status,
  p_expires_at timestamp with time zone
)
RETURNS public.request_status
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT
    CASE
      WHEN public.request_in_awaiting_review(p_status, p_expires_at)
        THEN 'awaiting_review'::public.request_status
      ELSE p_status
    END;
$$;

CREATE OR REPLACE FUNCTION public.transition_request_to_awaiting_review(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_status public.request_status;
  v_from_status public.request_status;
  v_expires_at timestamptz;
  v_requester_id uuid;
BEGIN
  SELECT r.status, r.expires_at, r.requester_id
    INTO v_status, v_expires_at, v_requester_id
  FROM public.requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_status = 'awaiting_review' THEN
    RETURN false;
  END IF;

  IF v_status = 'expired' THEN
    RETURN false;
  END IF;

  IF v_status <> 'posted' THEN
    RETURN false;
  END IF;

  IF v_expires_at IS NULL OR v_expires_at > now() THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.handshakes h WHERE h.request_id = p_request_id) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.requests r
    WHERE r.id = p_request_id
      AND r.status = ANY (
        ARRAY[
          'accepted'::public.request_status,
          'in_progress'::public.request_status,
          'completion_pending'::public.request_status
        ]
      )
  ) THEN
    RETURN false;
  END IF;

  v_from_status := v_status;

  UPDATE public.requests
  SET status = 'awaiting_review'::public.request_status
  WHERE id = p_request_id;

  PERFORM public.record_request_status_event(
    p_request_id,
    v_requester_id,
    v_from_status,
    'awaiting_review'::public.request_status,
    'awaiting_review:' || p_request_id::text
  );

  PERFORM public.create_notification(
    v_requester_id,
    'request:' || p_request_id::text || ':awaiting_review:requester',
    'request_awaiting_review'::public.notification_type,
    'Review your request',
    'The response window ended. Review responses, extend the deadline, or close the request.',
    format('/request/%s', p_request_id),
    p_request_id,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    true
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN public.transition_request_to_awaiting_review(p_request_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_due_requests(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request_id uuid;
  v_closed_count integer := 0;
BEGIN
  IF p_limit < 1 THEN
    RAISE EXCEPTION 'limit must be at least 1' USING errcode = '22023';
  END IF;

  FOR v_request_id IN
    SELECT r.id
    FROM public.requests r
    WHERE r.status = 'posted'::public.request_status
      AND r.expires_at IS NOT NULL
      AND r.expires_at <= now()
      AND NOT EXISTS (SELECT 1 FROM public.handshakes h WHERE h.request_id = r.id)
    ORDER BY r.expires_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    IF public.transition_request_to_awaiting_review(v_request_id) THEN
      v_closed_count := v_closed_count + 1;
    END IF;
  END LOOP;

  RETURN v_closed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_expire_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_status public.request_status;
  v_expires_at timestamptz;
  v_from_status public.request_status;
  v_payment public.payment_status;
  v_responder_ids uuid[];
  v_responder_id uuid;
BEGIN
  SELECT r.status, r.expires_at, r.payment_status
    INTO v_status, v_expires_at, v_payment
  FROM public.requests r
  WHERE r.id = p_request_id
    AND r.requester_id = v_user_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_status = 'expired' THEN
    RETURN;
  END IF;

  IF NOT public.request_in_awaiting_review(v_status, v_expires_at) THEN
    RAISE EXCEPTION 'this request cannot be expired' USING errcode = '55000';
  END IF;

  IF EXISTS (SELECT 1 FROM public.handshakes h WHERE h.request_id = p_request_id) THEN
    RAISE EXCEPTION 'this request cannot be expired' USING errcode = '55000';
  END IF;

  v_from_status := CASE
    WHEN v_status = 'awaiting_review' THEN 'awaiting_review'::public.request_status
    ELSE 'posted'::public.request_status
  END;

  IF v_status = 'posted' AND v_expires_at <= now() THEN
    UPDATE public.requests
    SET status = 'awaiting_review'::public.request_status
    WHERE id = p_request_id
      AND status = 'posted'::public.request_status;
  END IF;

  SELECT coalesce(array_agg(DISTINCT rr.responder_id), '{}')
    INTO v_responder_ids
  FROM public.request_responses rr
  WHERE rr.request_id = p_request_id
    AND rr.status = 'pending'::public.response_status;

  UPDATE public.requests
  SET status = 'expired'::public.request_status
  WHERE id = p_request_id;

  PERFORM public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_from_status,
    'expired'::public.request_status,
    'owner_expire:' || p_request_id::text
  );

  IF v_payment = 'locked'::public.payment_status THEN
    PERFORM public.apply_payment_transition(
      p_request_id,
      'refunded'::public.payment_status,
      'owner_expire:' || p_request_id::text
    );
  END IF;

  FOREACH v_responder_id IN ARRAY v_responder_ids
  LOOP
    PERFORM public.create_notification(
      v_responder_id,
      'request:' || p_request_id::text || ':expired:responder:' || v_responder_id::text,
      'request_expired'::public.notification_type,
      'Request closed',
      'The requester closed this request before anyone was chosen.',
      format('/respond/%s', p_request_id),
      p_request_id,
      NULL,
      NULL,
      NULL,
      NULL,
      jsonb_build_object('link', 'respond'),
      true
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_request(
  p_request_id uuid,
  p_expires_at timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_status public.request_status;
  v_expires_at timestamptz;
  v_from_status public.request_status;
BEGIN
  IF p_expires_at IS NULL OR p_expires_at <= now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'new response deadline must be at least 5 minutes in the future' USING errcode = '22023';
  END IF;

  IF p_expires_at > now() + interval '30 days' THEN
    RAISE EXCEPTION 'new response deadline is too far in the future' USING errcode = '22023';
  END IF;

  SELECT r.status, r.expires_at
    INTO v_status, v_expires_at
  FROM public.requests r
  WHERE r.id = p_request_id
    AND r.requester_id = v_user_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF NOT public.request_in_awaiting_review(v_status, v_expires_at) THEN
    RAISE EXCEPTION 'only requests awaiting review can be extended' USING errcode = '55000';
  END IF;

  IF EXISTS (SELECT 1 FROM public.handshakes h WHERE h.request_id = p_request_id) THEN
    RAISE EXCEPTION 'this request cannot be extended' USING errcode = '55000';
  END IF;

  v_from_status := CASE
    WHEN v_status = 'awaiting_review' THEN 'awaiting_review'::public.request_status
    ELSE 'posted'::public.request_status
  END;

  UPDATE public.requests
  SET status = 'posted'::public.request_status,
      expires_at = p_expires_at
  WHERE id = p_request_id;

  UPDATE public.request_responses rr
  SET expires_at = p_expires_at
  WHERE rr.request_id = p_request_id
    AND rr.status = 'pending'::public.response_status;

  PERFORM public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_from_status,
    'posted'::public.request_status,
    'extend:' || p_request_id::text || ':' || to_char(p_expires_at, 'YYYYMMDDHH24MISS')
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
    WHERE h.request_id = v_request_id
      AND h.response_id = p_response_id
  ) THEN
    RETURN v_request_id;
  END IF;

  SELECT r.status, r.payment_status, r.requester_id, r.expires_at, r.offered_amount
    INTO v_request_status, v_payment, v_requester_id, v_request_expires_at, v_offered_amount
  FROM public.requests r
  WHERE r.id = v_request_id
  FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.handshakes h WHERE h.request_id = v_request_id) THEN
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
     OR v_response_status IS DISTINCT FROM 'pending' THEN
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

  v_handshake_key := 'handshake:' || v_request_id::text;

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

  UPDATE public.request_responses
  SET status = 'declined', resolved_at = now()
  WHERE request_id = v_request_id
    AND id <> p_response_id
    AND status = 'pending';

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

  PERFORM public.notify_responders_not_chosen(v_request_id, p_response_id);

  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_request_cancellation(
  p_request_id uuid,
  p_actor_id uuid,
  p_status_event_key text,
  p_payment_idempotency_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_status public.request_status;
  v_selected_user_id uuid;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_responder_ids uuid[];
  v_responder_id uuid;
BEGIN
  IF p_status_event_key IS NULL OR btrim(p_status_event_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  IF p_payment_idempotency_key IS NULL OR btrim(p_payment_idempotency_key) = '' THEN
    RAISE EXCEPTION 'payment idempotency key is required' USING errcode = '22023';
  END IF;

  SELECT r.status, r.selected_user_id, r.requester_id, r.payment_status
    INTO v_status, v_selected_user_id, v_requester_id, v_payment
  FROM public.requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN false;
  END IF;

  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'a completed request cannot be cancelled' USING errcode = '55000';
  END IF;

  IF v_status IN ('expired', 'no_show', 'disputed') THEN
    RAISE EXCEPTION 'a request cannot be cancelled once it is %', v_status USING errcode = '55000';
  END IF;

  IF v_status NOT IN (
    'draft',
    'posted',
    'awaiting_review',
    'accepted',
    'in_progress',
    'completion_pending'
  ) THEN
    RAISE EXCEPTION 'a request cannot be cancelled once it is %', v_status USING errcode = '55000';
  END IF;

  IF v_status IN ('posted', 'awaiting_review') THEN
    SELECT coalesce(array_agg(DISTINCT rr.responder_id), '{}')
      INTO v_responder_ids
    FROM public.request_responses rr
    WHERE rr.request_id = p_request_id
      AND rr.status = 'pending';
  END IF;

  UPDATE public.request_responses
  SET status = CASE
                 WHEN status = 'accepted' THEN 'declined'::public.response_status
                 ELSE 'expired'::public.response_status
               END,
      resolved_at = coalesce(resolved_at, now())
  WHERE request_id = p_request_id
    AND status IN ('pending', 'accepted');

  UPDATE public.requests
  SET status = 'cancelled',
      cancelled_at = now(),
      selected_user_id = NULL,
      accepted_response_id = NULL,
      completion_confirm_by = NULL
  WHERE id = p_request_id;

  PERFORM public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_status,
    'cancelled'::public.request_status,
    p_status_event_key
  );

  IF v_payment IN ('locked', 'pending') THEN
    PERFORM public.apply_payment_transition(
      p_request_id,
      'refunded'::public.payment_status,
      p_payment_idempotency_key
    );
  END IF;

  IF v_selected_user_id IS NOT NULL THEN
    PERFORM public.release_provider(v_selected_user_id);
  END IF;

  IF v_status IN ('posted', 'awaiting_review') AND p_actor_id = v_requester_id THEN
    FOREACH v_responder_id IN ARRAY v_responder_ids
    LOOP
      PERFORM public.create_notification(
        v_responder_id,
        'cancel:' || p_status_event_key || ':responder:' || v_responder_id::text,
        'request_cancelled'::public.notification_type,
        'Request cancelled',
        'A request you responded to was cancelled.',
        format('/respond/%s', p_request_id),
        p_request_id,
        NULL,
        NULL,
        NULL,
        NULL,
        jsonb_build_object('link', 'respond'),
        true
      );
    END LOOP;
  END IF;

  RETURN true;
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
      'problem_reported'::public.notification_type,
      'dispute_opened'::public.notification_type,
      'dispute_resolved'::public.notification_type,
      'funds_released_after_resolution'::public.notification_type,
      'rate_experience'::public.notification_type
    ]
  );
$$;

DROP VIEW IF EXISTS public.my_requests;

CREATE VIEW public.my_requests WITH (security_invoker = on) AS
 SELECT
    r.id AS request_id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.agreed_provider_amount,
    r.currency,
    r.payment_status,
    r.location_label,
    extensions.st_y((r.location)::extensions.geometry) AS latitude,
    extensions.st_x((r.location)::extensions.geometry) AS longitude,
    public.request_effective_status(r.status, r.expires_at) AS status,
    r.selected_user_id,
    r.source_request_id,
    r.attachment_path,
    public.request_tag_slugs(r.id) AS tag_slugs,
    (
      SELECT (count(*))::integer AS count
      FROM public.request_responses rr
      WHERE rr.request_id = r.id
        AND rr.status = 'pending'::public.response_status
    ) AS pending_response_count,
    r.first_response_at,
    public.request_allows_requester_edit(r.status, r.expires_at, r.accepted_at, r.id) AS is_editable,
    (
      EXISTS (
        SELECT 1
        FROM public.ratings g
        WHERE g.request_id = r.id
          AND g.rater_id = (SELECT auth.uid() AS uid)
      )
    ) AS is_rated,
    r.created_at,
    r.updated_at,
    r.submitted_at,
    r.expires_at,
    r.accepted_at,
    r.started_at,
    r.completed_at,
    r.cancelled_at,
    my_rating.stars AS my_rating_stars,
    my_rating.comment AS my_rating_comment
   FROM public.requests r
   LEFT JOIN public.ratings my_rating
     ON my_rating.request_id = r.id
    AND my_rating.rater_id = r.requester_id
  WHERE r.requester_id = (SELECT auth.uid() AS uid);

GRANT ALL ON TABLE public.my_requests TO anon;
GRANT ALL ON TABLE public.my_requests TO authenticated;
GRANT ALL ON TABLE public.my_requests TO service_role;

DROP FUNCTION IF EXISTS public.my_responses();

CREATE OR REPLACE FUNCTION public.my_responses()
RETURNS TABLE(
  response_id uuid,
  request_id uuid,
  title text,
  description text,
  location_label text,
  distance_m integer,
  scheduled_for timestamp with time zone,
  offered_amount numeric,
  currency text,
  quoted_amount numeric,
  message text,
  response_status public.response_status,
  request_status public.request_status,
  decline_reason text,
  requester_id uuid,
  requester_display_name text,
  requester_avatar_path text,
  requester_bio text,
  requester_rating_average numeric,
  requester_rating_count integer,
  requester_completion_percent integer,
  attachment_path text,
  created_at timestamp with time zone,
  posted_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH me AS (SELECT public.assert_onboarded() AS user_id)
  SELECT
    rr.id,
    r.id,
    r.title,
    r.description,
    r.location_label,
    rr.distance_m,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    rr.quoted_amount,
    rr.message,
    rr.status,
    public.request_effective_status(r.status, r.expires_at),
    rr.decline_reason,
    r.requester_id,
    p.display_name,
    p.avatar_path,
    p.bio,
    p.rating_average,
    p.rating_count,
    public.requester_completion_percent(r.requester_id),
    r.attachment_path,
    rr.created_at,
    r.created_at
  FROM me
  JOIN public.request_responses rr ON rr.responder_id = me.user_id
  JOIN public.requests r ON r.id = rr.request_id
  JOIN public.profiles p ON p.id = r.requester_id
  ORDER BY rr.created_at DESC;
$$;

GRANT ALL ON FUNCTION public.my_responses() TO anon;
GRANT ALL ON FUNCTION public.my_responses() TO authenticated;
GRANT ALL ON FUNCTION public.my_responses() TO service_role;

REVOKE ALL ON FUNCTION public.owner_expire_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_expire_request(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.owner_expire_request(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.extend_request(uuid, timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extend_request(uuid, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.extend_request(uuid, timestamp with time zone) TO service_role;

-- Reuse only after the requester permanently closes or completes (not while awaiting review).
CREATE OR REPLACE FUNCTION public.create_request(
  p_title text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_scheduled_for timestamp with time zone DEFAULT NULL,
  p_offered_amount numeric DEFAULT NULL,
  p_source_request_id uuid DEFAULT NULL,
  p_attachment_path text DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_location extensions.geography := public.assert_coordinates(p_latitude, p_longitude);
  v_description text := nullif(btrim(p_description), '');
  v_request_id uuid;
  v_source public.requests%rowtype;
BEGIN
  IF char_length(btrim(p_title)) < 3 OR char_length(btrim(p_title)) > 120 THEN
    RAISE EXCEPTION 'title must be between 3 and 120 characters' USING errcode = '22023';
  END IF;

  IF v_description IS NOT NULL
     AND (char_length(v_description) < 1 OR char_length(v_description) > 1000) THEN
    RAISE EXCEPTION 'description must be between 1 and 1000 characters' USING errcode = '22023';
  END IF;

  IF p_offered_amount IS NULL OR p_offered_amount <= 0 THEN
    RAISE EXCEPTION 'offer amount must be greater than zero' USING errcode = '22023';
  END IF;

  IF p_scheduled_for IS NOT NULL AND p_scheduled_for < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'scheduled time is in the past' USING errcode = '22023';
  END IF;

  IF p_scheduled_for IS NOT NULL AND p_scheduled_for > now() + interval '30 days' THEN
    RAISE EXCEPTION 'scheduled time is too far in the future' USING errcode = '22023';
  END IF;

  IF p_attachment_path IS NOT NULL THEN
    IF split_part(p_attachment_path, '/', 1) <> v_user_id::text
       OR split_part(p_attachment_path, '/', 2) <> 'drafts' THEN
      RAISE EXCEPTION 'invalid attachment path' USING errcode = '22023';
    END IF;
  END IF;

  IF p_source_request_id IS NOT NULL THEN
    SELECT * INTO v_source
    FROM public.requests
    WHERE id = p_source_request_id AND requester_id = v_user_id;

    IF v_source.id IS NULL THEN
      RAISE EXCEPTION 'source request not found' USING errcode = 'P0002';
    END IF;

    IF NOT (
      v_source.status = 'completed'
      OR v_source.status = 'expired'
    ) THEN
      RAISE EXCEPTION 'only expired or completed requests can be reused' USING errcode = '55000';
    END IF;
  END IF;

  IF (
    SELECT count(*) FROM public.requests
    WHERE requester_id = v_user_id
      AND (
        status IN ('accepted', 'in_progress', 'completion_pending')
        OR (status = 'posted' AND expires_at > now())
      )
  ) >= 5 THEN
    RAISE EXCEPTION 'you already have 5 open requests' USING errcode = '55000';
  END IF;

  PERFORM public.ensure_wallet_account(v_user_id);

  INSERT INTO public.requests (
    requester_id,
    title,
    description,
    scheduled_for,
    offered_amount,
    payment_status,
    location,
    location_label,
    status,
    submitted_at,
    expires_at,
    source_request_id,
    attachment_path
  )
  VALUES (
    v_user_id,
    btrim(p_title),
    v_description,
    p_scheduled_for,
    p_offered_amount,
    'not_required'::public.payment_status,
    v_location,
    btrim(p_location_label),
    'posted',
    now(),
    public.request_expires_at(p_scheduled_for),
    p_source_request_id,
    p_attachment_path
  )
  RETURNING id INTO v_request_id;

  PERFORM public.attach_tags_to_request(v_request_id, p_tag_ids);

  PERFORM public.notify_tag_interest_subscribers(v_request_id);

  RETURN v_request_id;
END;
$$;
