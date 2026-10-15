-- Engagement cancellation: provider immediate cancel; client consent + 24h auto-expire.
-- Reopens the request for fallback provider selection without terminal cancel.

-- ---------------------------------------------------------------------------
-- Types and tables
-- ---------------------------------------------------------------------------

CREATE TYPE public.engagement_cancellation_request_status AS ENUM (
  'pending',
  'agreed',
  'declined',
  'expired',
  'superseded'
);

CREATE TYPE public.engagement_cancellation_event_kind AS ENUM (
  'provider_immediate',
  'requester_requested',
  'provider_agreed',
  'provider_declined',
  'auto_expired'
);

CREATE TABLE public.engagement_cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests (id) ON DELETE RESTRICT,
  initiated_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  initiator_role text NOT NULL,
  reason text,
  status public.engagement_cancellation_request_status NOT NULL DEFAULT 'pending',
  respond_by timestamptz,
  provider_response_reason text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  settlement_idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engagement_cancellation_requests_initiator_role_check CHECK (
    initiator_role = ANY (ARRAY['requester'::text, 'provider'::text])
  ),
  CONSTRAINT engagement_cancellation_requests_reason_check CHECK (
    reason IS NULL
    OR (
      char_length(btrim(reason)) >= 1
      AND char_length(btrim(reason)) <= 500
    )
  ),
  CONSTRAINT engagement_cancellation_requests_provider_response_reason_check CHECK (
    provider_response_reason IS NULL
    OR (
      char_length(btrim(provider_response_reason)) >= 1
      AND char_length(btrim(provider_response_reason)) <= 500
    )
  ),
  CONSTRAINT engagement_cancellation_requests_respond_by_when_pending CHECK (
    status <> 'pending'::public.engagement_cancellation_request_status
    OR respond_by IS NOT NULL
  )
);

CREATE UNIQUE INDEX engagement_cancellation_requests_one_pending_per_request_idx
  ON public.engagement_cancellation_requests (request_id)
  WHERE status = 'pending'::public.engagement_cancellation_request_status;

CREATE INDEX engagement_cancellation_requests_respond_by_idx
  ON public.engagement_cancellation_requests (respond_by)
  WHERE status = 'pending'::public.engagement_cancellation_request_status;

CREATE TABLE public.engagement_cancellation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests (id) ON DELETE RESTRICT,
  cancellation_request_id uuid REFERENCES public.engagement_cancellation_requests (id) ON DELETE SET NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  kind public.engagement_cancellation_event_kind NOT NULL,
  reason text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engagement_cancellation_events_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT engagement_cancellation_events_reason_check CHECK (
    reason IS NULL
    OR (
      char_length(btrim(reason)) >= 1
      AND char_length(btrim(reason)) <= 500
    )
  )
);

CREATE INDEX engagement_cancellation_events_request_idx
  ON public.engagement_cancellation_events (request_id, created_at DESC);

-- Allow a new handshake row when the client selects another provider after engagement end.
ALTER TABLE ONLY public.handshakes
  DROP CONSTRAINT IF EXISTS handshakes_request_id_key;

CREATE INDEX IF NOT EXISTS handshakes_request_id_created_idx
  ON public.handshakes (request_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.engagement_cancellation_interval()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT interval '24 hours';
$$;

CREATE OR REPLACE FUNCTION public.normalize_engagement_cancellation_reason(p_reason text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN p_reason IS NULL OR btrim(p_reason) = '' THEN NULL
    WHEN char_length(btrim(p_reason)) > 500 THEN NULL
    ELSE btrim(p_reason)
  END;
$$;

CREATE OR REPLACE FUNCTION public.assert_engagement_cancellable(p_request_id uuid)
RETURNS public.requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request public.requests%rowtype;
BEGIN
  SELECT * INTO v_request
  FROM public.requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_request.status NOT IN (
    'accepted'::public.request_status,
    'in_progress'::public.request_status
  ) THEN
    RAISE EXCEPTION 'this engagement cannot be cancelled in its current state'
      USING errcode = '55000';
  END IF;

  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_engagement_cancellation_event(
  p_request_id uuid,
  p_cancellation_request_id uuid,
  p_actor_id uuid,
  p_kind public.engagement_cancellation_event_kind,
  p_reason text,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  INSERT INTO public.engagement_cancellation_events (
    request_id,
    cancellation_request_id,
    actor_id,
    kind,
    reason,
    idempotency_key
  )
  VALUES (
    p_request_id,
    p_cancellation_request_id,
    p_actor_id,
    p_kind,
    public.normalize_engagement_cancellation_reason(p_reason),
    p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- Core settlement: refund, reopen request, restore alternative responses
-- ---------------------------------------------------------------------------

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

  UPDATE public.request_responses rr
  SET status = 'pending'::public.response_status,
      resolved_at = NULL,
      decline_reason = NULL
  WHERE rr.request_id = p_request_id
    AND rr.status = 'declined'::public.response_status
    AND rr.decline_reason IS NULL
    AND (v_accepted_response_id IS NULL OR rr.id <> v_accepted_response_id);

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

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_engagement_as_provider(
  p_request_id uuid,
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
  v_reason text := public.normalize_engagement_cancellation_reason(p_reason);
  v_status_key text;
  v_payment_key text;
BEGIN
  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'cancellation reason must be 500 characters or fewer' USING errcode = '22023';
  END IF;

  v_request := public.assert_engagement_cancellable(p_request_id);

  IF v_request.selected_user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  UPDATE public.engagement_cancellation_requests ecr
  SET status = 'superseded'::public.engagement_cancellation_request_status,
      resolved_at = now()
  WHERE ecr.request_id = p_request_id
    AND ecr.status = 'pending'::public.engagement_cancellation_request_status;

  v_status_key := 'engagement_cancel:provider:' || p_request_id::text;
  v_payment_key := 'engagement_cancel_settle:' || p_request_id::text || ':provider';

  PERFORM public.finalize_engagement_cancellation(
    p_request_id,
    v_user_id,
    v_status_key,
    v_payment_key,
    'provider_immediate'::public.engagement_cancellation_event_kind,
    v_reason,
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_engagement_cancellation(
  p_request_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_request public.requests%rowtype;
  v_reason text := public.normalize_engagement_cancellation_reason(p_reason);
  v_request_id uuid;
  v_cancellation_id uuid;
  v_respond_by timestamptz;
  v_provider_first text;
BEGIN
  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'cancellation reason must be 500 characters or fewer' USING errcode = '22023';
  END IF;

  v_request := public.assert_engagement_cancellable(p_request_id);

  IF v_request.requester_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.engagement_cancellation_requests ecr
    WHERE ecr.request_id = p_request_id
      AND ecr.status = 'pending'::public.engagement_cancellation_request_status
  ) THEN
    RAISE EXCEPTION 'a cancellation request is already pending' USING errcode = '55000';
  END IF;

  v_respond_by := now() + public.engagement_cancellation_interval();

  INSERT INTO public.engagement_cancellation_requests (
    request_id,
    initiated_by,
    initiator_role,
    reason,
    status,
    respond_by
  )
  VALUES (
    p_request_id,
    v_user_id,
    'requester',
    v_reason,
    'pending',
    v_respond_by
  )
  RETURNING id INTO v_cancellation_id;

  PERFORM public.record_engagement_cancellation_event(
    p_request_id,
    v_cancellation_id,
    v_user_id,
    'requester_requested'::public.engagement_cancellation_event_kind,
    v_reason,
    'engagement_cancel:request:' || v_cancellation_id::text
  );

  SELECT coalesce(public.display_first_name(p.display_name), 'The requester')
    INTO v_provider_first
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_request.selected_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_request.selected_user_id,
      'engagement_cancel:pending:' || v_cancellation_id::text,
      'engagement_cancellation_requested'::public.notification_type,
      'Cancellation requested',
      format(
        '%s asked to cancel this request. Respond by %s.',
        v_provider_first,
        to_char(v_respond_by AT TIME ZONE 'UTC', 'Mon DD, YYYY HH24:MI') || ' UTC'
      ),
      format('/engagement/%s', p_request_id),
      p_request_id,
      NULL,
      NULL,
      NULL,
      v_user_id,
      jsonb_build_object(
        'respond_by',
        v_respond_by,
        'cancellation_request_id',
        v_cancellation_id
      ),
      true
    );
  END IF;

  RETURN v_cancellation_id;
END;
$$;

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

    UPDATE public.engagement_cancellation_requests
    SET status = 'agreed'::public.engagement_cancellation_request_status,
        resolved_at = now(),
        resolved_by = v_user_id,
        provider_response_reason = v_reason,
        settlement_idempotency_key = v_payment_key
    WHERE id = v_row.id
      AND status = 'pending'::public.engagement_cancellation_request_status;

    IF NOT FOUND THEN
      RETURN;
    END IF;

    PERFORM public.finalize_engagement_cancellation(
      p_request_id,
      v_user_id,
      v_status_key,
      v_payment_key,
      'provider_agreed'::public.engagement_cancellation_event_kind,
      coalesce(v_reason, v_row.reason),
      v_row.id
    );
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

    UPDATE public.engagement_cancellation_requests
    SET status = 'expired'::public.engagement_cancellation_request_status,
        resolved_at = now(),
        settlement_idempotency_key = v_payment_key
    WHERE id = v_row.id
      AND status = 'pending'::public.engagement_cancellation_request_status;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    PERFORM public.finalize_engagement_cancellation(
      v_row.request_id,
      v_requester_id,
      v_status_key,
      v_payment_key,
      'auto_expired'::public.engagement_cancellation_event_kind,
      v_row.reason,
      v_row.id
    );

    v_expired_count := v_expired_count + 1;
  END LOOP;

  RETURN v_expired_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_engagement_cancellation(p_request_id uuid)
RETURNS TABLE (
  cancellation_request_id uuid,
  status public.engagement_cancellation_request_status,
  initiated_by uuid,
  initiator_role text,
  reason text,
  respond_by timestamptz,
  provider_response_reason text,
  resolved_at timestamptz,
  viewer_is_requester boolean,
  viewer_can_respond boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH me AS (
    SELECT public.assert_authenticated() AS user_id
  ),
  req AS (
    SELECT r.id, r.requester_id, r.selected_user_id
    FROM public.requests r
    JOIN me ON true
    WHERE r.id = p_request_id
      AND me.user_id IN (r.requester_id, r.selected_user_id)
  )
  SELECT
    ecr.id,
    ecr.status,
    ecr.initiated_by,
    ecr.initiator_role,
    ecr.reason,
    ecr.respond_by,
    ecr.provider_response_reason,
    ecr.resolved_at,
    req.requester_id = me.user_id,
    req.selected_user_id = me.user_id
      AND ecr.status = 'pending'::public.engagement_cancellation_request_status
      AND ecr.respond_by > now()
  FROM me
  JOIN req ON true
  LEFT JOIN public.engagement_cancellation_requests ecr
    ON ecr.request_id = req.id
    AND ecr.status IN (
      'pending'::public.engagement_cancellation_request_status,
      'agreed'::public.engagement_cancellation_request_status,
      'declined'::public.engagement_cancellation_request_status,
      'expired'::public.engagement_cancellation_request_status
    )
  ORDER BY ecr.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.list_engagement_cancellation_events(p_request_id uuid)
RETURNS TABLE (
  event_id uuid,
  kind public.engagement_cancellation_event_kind,
  actor_id uuid,
  reason text,
  cancellation_request_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    e.id,
    e.kind,
    e.actor_id,
    e.reason,
    e.cancellation_request_id,
    e.created_at
  FROM public.engagement_cancellation_events e
  WHERE e.request_id = p_request_id
    AND EXISTS (
      SELECT 1
      FROM public.requests r
      WHERE r.id = p_request_id
        AND (
          public.assert_authenticated() = r.requester_id
          OR public.assert_authenticated() = r.selected_user_id
          OR public.assert_authenticated() = e.actor_id
        )
    )
  ORDER BY e.created_at ASC;
$$;

-- ---------------------------------------------------------------------------
-- Payment transition: reopen after engagement refund
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_payment_transition(
  p_request_id uuid,
  p_to_status public.payment_status,
  p_idempotency_key text
)
RETURNS public.payment_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_from public.payment_status;
  v_allowed boolean;
  v_existing public.payment_status;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  SELECT pt.to_status INTO v_existing
  FROM public.payment_transitions pt
  WHERE pt.request_id = p_request_id
    AND pt.idempotency_key = p_idempotency_key;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT payment_status INTO v_from
  FROM public.requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_from IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  v_allowed := CASE
    WHEN v_from = 'not_required' AND p_to_status = 'not_required' THEN true
    WHEN v_from = 'available' AND p_to_status IN ('locked', 'not_required') THEN true
    WHEN v_from = 'not_required' AND p_to_status = 'locked' THEN true
    WHEN v_from = 'locked' AND p_to_status IN ('pending', 'refunded', 'disputed') THEN true
    WHEN v_from = 'pending' AND p_to_status IN ('released', 'refunded', 'disputed') THEN true
    WHEN v_from = 'released' AND p_to_status = 'disputed' THEN true
    WHEN v_from = 'refunded' AND p_to_status IN ('disputed', 'not_required') THEN true
    WHEN v_from = 'disputed' AND p_to_status IN ('released', 'refunded', 'pending', 'locked') THEN true
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'payment cannot move from % to %', v_from, p_to_status USING errcode = '55000';
  END IF;

  PERFORM public.sync_wallet_payment_transition(
    p_request_id,
    v_from,
    p_to_status,
    p_idempotency_key
  );

  INSERT INTO public.payment_transitions (request_id, idempotency_key, from_status, to_status)
  VALUES (p_request_id, p_idempotency_key, v_from, p_to_status);

  UPDATE public.requests
  SET payment_status = p_to_status
  WHERE id = p_request_id;

  RETURN p_to_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- Wire existing entry points
-- ---------------------------------------------------------------------------

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

  IF v_status IN ('accepted', 'in_progress') THEN
    PERFORM public.request_engagement_cancellation(p_request_id, p_reason);
    RETURN;
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
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_selected_user_id uuid;
  v_status public.request_status;
BEGIN
  SELECT r.selected_user_id, r.status
    INTO v_selected_user_id, v_status
  FROM public.requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_selected_user_id IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_selected_user_id <> v_user_id THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_status NOT IN ('accepted', 'in_progress') THEN
    RAISE EXCEPTION 'only an active service can be cancelled by the provider before completion is marked'
      USING errcode = '55000';
  END IF;

  PERFORM public.cancel_engagement_as_provider(p_request_id, p_reason);
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

  IF EXISTS (
    SELECT 1
    FROM public.engagement_cancellation_requests ecr
    WHERE ecr.request_id = p_request_id
      AND ecr.status = 'pending'::public.engagement_cancellation_request_status
  ) THEN
    RAISE EXCEPTION 'cannot mark complete while a cancellation request is pending'
      USING errcode = '55000';
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

-- get_engagement: join handshake by accepted response, not request_id alone
CREATE OR REPLACE FUNCTION public.get_engagement(p_request_id uuid)
RETURNS TABLE(
  request_id uuid,
  title text,
  description text,
  scheduled_for timestamp with time zone,
  offered_amount numeric,
  agreed_provider_amount numeric,
  quoted_amount numeric,
  currency text,
  request_status public.request_status,
  payment_status public.payment_status,
  accepted_at timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  completion_confirm_by timestamp with time zone,
  service_problem_kind public.service_problem_kind,
  service_problem_respond_by timestamp with time zone,
  service_problem_reported_by_me boolean,
  service_problem_description text,
  viewer_is_requester boolean,
  location_label text,
  request_latitude double precision,
  request_longitude double precision,
  counterparty_id uuid,
  counterparty_display_name text,
  counterparty_avatar_path text,
  counterparty_phone text,
  counterparty_bio text,
  counterparty_rating_average numeric,
  counterparty_rating_count integer,
  counterparty_completion_percent integer,
  rating_stars smallint,
  rating_comment text,
  viewer_has_rated boolean,
  handshake_id uuid,
  handshake_at timestamp with time zone,
  tag_slugs text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH me AS (SELECT public.assert_authenticated() AS user_id)
  SELECT
    r.id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.agreed_provider_amount,
    accepted.quoted_amount,
    r.currency,
    r.status,
    r.payment_status,
    r.accepted_at,
    r.started_at,
    r.completed_at,
    r.completion_confirm_by,
    sp.kind,
    sp.respond_by,
    sp.reported_by = me.user_id,
    sp.description,
    r.requester_id = me.user_id,
    r.location_label,
    extensions.ST_Y(r.location::extensions.geometry),
    extensions.ST_X(r.location::extensions.geometry),
    counterparty.id,
    counterparty.display_name,
    counterparty.avatar_path,
    counterparty.phone,
    counterparty.bio,
    counterparty.rating_average,
    counterparty.rating_count,
    CASE
      WHEN counterparty.id = r.selected_user_id THEN public.provider_completion_percent(counterparty.id)
      ELSE public.requester_completion_percent(counterparty.id)
    END,
    received.stars,
    received.comment,
    EXISTS (
      SELECT 1
      FROM public.ratings submitted
      WHERE submitted.request_id = r.id
        AND submitted.rater_id = me.user_id
    ),
    h.id,
    h.created_at,
    public.request_tag_slugs(r.id)
  FROM me
  JOIN public.requests r
    ON r.id = p_request_id
   AND r.status IN (
     'accepted',
     'in_progress',
     'completion_pending',
     'completed',
     'disputed',
     'no_show'
   )
   AND me.user_id IN (r.requester_id, r.selected_user_id)
  JOIN public.profiles counterparty
    ON counterparty.id = CASE
      WHEN r.requester_id = me.user_id THEN r.selected_user_id
      ELSE r.requester_id
    END
  LEFT JOIN public.request_responses accepted ON accepted.id = r.accepted_response_id
  LEFT JOIN public.service_problems sp
    ON sp.request_id = r.id
   AND sp.status = 'open'
  LEFT JOIN public.ratings received
    ON received.request_id = r.id
   AND received.ratee_id = me.user_id
   AND received.rater_id = counterparty.id
  LEFT JOIN public.handshakes h
    ON h.request_id = r.id
   AND h.response_id = r.accepted_response_id;
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
      'engagement_cancellation_requested'::public.notification_type,
      'engagement_cancellation_declined'::public.notification_type,
      'problem_reported'::public.notification_type,
      'dispute_opened'::public.notification_type,
      'dispute_resolved'::public.notification_type,
      'funds_released_after_resolution'::public.notification_type,
      'rate_experience'::public.notification_type
    ]
  );
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.engagement_cancellation_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.engagement_cancellation_events FROM PUBLIC;
GRANT SELECT ON TABLE public.engagement_cancellation_requests TO service_role;
GRANT SELECT ON TABLE public.engagement_cancellation_events TO service_role;

REVOKE ALL ON FUNCTION public.cancel_engagement_as_provider(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_engagement_cancellation(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_engagement_cancellation(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_engagement_cancellation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_engagement_cancellation_events(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_due_engagement_cancellation_requests(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.cancel_engagement_as_provider(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_engagement_cancellation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_engagement_cancellation(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_engagement_cancellation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_engagement_cancellation_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_due_engagement_cancellation_requests(integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.cancel_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_service(uuid, text) TO authenticated;

-- Scheduled expiration (pg_cron extension is installed in baseline migrations).
DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'expire-engagement-cancellation-requests';

    PERFORM cron.schedule(
      'expire-engagement-cancellation-requests',
      '* * * * *',
      $job$SELECT public.expire_due_engagement_cancellation_requests(100)$job$
    );
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
    RAISE NOTICE 'pg_cron schedule for engagement cancellation expiry was not applied';
END;
$schedule$;
