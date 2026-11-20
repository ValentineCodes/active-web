-- Request responses: duration picker (replaces calendar proposal for new responds).
-- Legacy calendar proposals (proposed_delivery_at) remain supported on accept/start.

DO $$
BEGIN
  CREATE TYPE public.delivery_duration_unit AS ENUM (
    'minutes',
    'hours',
    'days',
    'weeks'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE public.request_responses
  ADD COLUMN IF NOT EXISTS proposed_delivery_duration_seconds bigint,
  ADD COLUMN IF NOT EXISTS proposed_delivery_duration_value integer,
  ADD COLUMN IF NOT EXISTS proposed_delivery_duration_unit public.delivery_duration_unit;

COMMENT ON COLUMN public.request_responses.proposed_delivery_duration_seconds IS
  'Authoritative proposed delivery duration in seconds (normalized on server).';
COMMENT ON COLUMN public.request_responses.proposed_delivery_duration_value IS
  'Worker-selected duration amount for display.';
COMMENT ON COLUMN public.request_responses.proposed_delivery_duration_unit IS
  'Worker-selected duration unit for display.';

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS proposed_delivery_duration_seconds bigint,
  ADD COLUMN IF NOT EXISTS proposed_delivery_duration_value integer,
  ADD COLUMN IF NOT EXISTS proposed_delivery_duration_unit public.delivery_duration_unit;

COMMENT ON COLUMN public.requests.proposed_delivery_duration_seconds IS
  'Accepted engagement proposed duration in seconds (copied at accept).';
COMMENT ON COLUMN public.requests.proposed_delivery_duration_value IS
  'Accepted engagement duration amount for display.';
COMMENT ON COLUMN public.requests.proposed_delivery_duration_unit IS
  'Accepted engagement duration unit for display.';

CREATE OR REPLACE FUNCTION public.request_engagement_max_delivery_interval()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT interval '28 days';
$$;

CREATE OR REPLACE FUNCTION public.request_engagement_max_delivery_seconds()
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT 28::bigint * 86400;
$$;

CREATE OR REPLACE FUNCTION public.delivery_duration_to_seconds(
  p_value integer,
  p_unit public.delivery_duration_unit
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE p_unit
    WHEN 'minutes'::public.delivery_duration_unit THEN p_value::bigint * 60
    WHEN 'hours'::public.delivery_duration_unit THEN p_value::bigint * 3600
    WHEN 'days'::public.delivery_duration_unit THEN p_value::bigint * 86400
    WHEN 'weeks'::public.delivery_duration_unit THEN p_value::bigint * 604800
  END;
$$;

CREATE OR REPLACE FUNCTION public.assert_valid_proposed_delivery_duration(
  p_value integer,
  p_unit public.delivery_duration_unit
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_seconds bigint;
BEGIN
  IF p_value IS NULL OR p_value < 1 THEN
    RAISE EXCEPTION 'delivery duration must be a positive whole number' USING errcode = '22023';
  END IF;

  IF p_unit IS NULL THEN
    RAISE EXCEPTION 'delivery duration unit is required' USING errcode = '22023';
  END IF;

  v_seconds := public.delivery_duration_to_seconds(p_value, p_unit);

  IF v_seconds < 60 THEN
    RAISE EXCEPTION 'delivery duration must be at least one minute' USING errcode = '55000';
  END IF;

  IF v_seconds > public.request_engagement_max_delivery_seconds() THEN
    RAISE EXCEPTION 'delivery duration exceeds the maximum of four weeks' USING errcode = '55000';
  END IF;

  RETURN v_seconds;
END;
$$;

DROP FUNCTION IF EXISTS public.respond_to_request(
  uuid,
  text,
  numeric,
  double precision,
  double precision,
  timestamptz,
  text
);

CREATE OR REPLACE FUNCTION public.respond_to_request(
  p_request_id uuid,
  p_message text DEFAULT NULL,
  p_quoted_amount numeric DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_proposed_delivery_duration_value integer DEFAULT NULL,
  p_proposed_delivery_duration_unit public.delivery_duration_unit DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_request public.requests%rowtype;
  v_distance_m integer;
  v_response_id uuid;
  v_duration_seconds bigint;
BEGIN
  v_duration_seconds := public.assert_valid_proposed_delivery_duration(
    p_proposed_delivery_duration_value,
    p_proposed_delivery_duration_unit
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.avatar_path IS NOT NULL
      AND p.avatar_captured_in_app
  ) THEN
    RAISE EXCEPTION 'add a profile photo in the app before responding' USING errcode = '55000';
  END IF;

  SELECT * INTO v_request
  FROM public.requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'this request is no longer available to you' USING errcode = '55000';
  END IF;

  IF v_request.expires_at IS NULL OR v_request.expires_at <= now() THEN
    RAISE EXCEPTION 'this request is no longer available to you' USING errcode = '55000';
  END IF;

  v_distance_m := public.request_open_to_user(
    p_request_id,
    v_user_id,
    p_latitude,
    p_longitude
  );

  IF v_distance_m IS NULL THEN
    RAISE EXCEPTION 'this request is no longer available to you' USING errcode = '55000';
  END IF;

  PERFORM public.record_discovery_coordinates(p_latitude, p_longitude);

  INSERT INTO public.request_responses (
    request_id,
    responder_id,
    message,
    quoted_amount,
    distance_m,
    expires_at,
    proposed_delivery_duration_seconds,
    proposed_delivery_duration_value,
    proposed_delivery_duration_unit,
    proposed_delivery_at,
    proposed_delivery_timezone
  )
  VALUES (
    p_request_id,
    v_user_id,
    nullif(btrim(p_message), ''),
    p_quoted_amount,
    v_distance_m,
    v_request.expires_at,
    v_duration_seconds,
    p_proposed_delivery_duration_value,
    p_proposed_delivery_duration_unit,
    NULL,
    NULL
  )
  ON CONFLICT (request_id, responder_id) DO UPDATE
  SET message = excluded.message,
      quoted_amount = excluded.quoted_amount,
      distance_m = excluded.distance_m,
      expires_at = excluded.expires_at,
      proposed_delivery_duration_seconds = excluded.proposed_delivery_duration_seconds,
      proposed_delivery_duration_value = excluded.proposed_delivery_duration_value,
      proposed_delivery_duration_unit = excluded.proposed_delivery_duration_unit,
      proposed_delivery_at = NULL,
      proposed_delivery_timezone = NULL
  WHERE public.request_responses.status = 'pending'
  RETURNING id INTO v_response_id;

  IF v_response_id IS NULL THEN
    RAISE EXCEPTION 'you already have a response on this request' USING errcode = '55000';
  END IF;

  RETURN v_response_id;
END;
$$;

-- accept_response: copy duration or legacy calendar proposal.
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
  v_payment_structure public.payment_structure;
  v_proposal_id uuid;
  v_accepted_at timestamptz := now();
  v_proposed_delivery_at timestamptz;
  v_proposed_delivery_timezone text;
  v_proposed_duration_seconds bigint;
  v_proposed_duration_value integer;
  v_proposed_duration_unit public.delivery_duration_unit;
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

  SELECT r.status, r.payment_status, r.requester_id, r.expires_at, r.offered_amount, r.payment_structure
    INTO v_request_status, v_payment, v_requester_id, v_request_expires_at, v_offered_amount, v_payment_structure
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

  SELECT
    rr.request_id,
    rr.responder_id,
    rr.status,
    rr.quoted_amount,
    rr.proposed_delivery_at,
    rr.proposed_delivery_timezone,
    rr.proposed_delivery_duration_seconds,
    rr.proposed_delivery_duration_value,
    rr.proposed_delivery_duration_unit
    INTO v_locked_request_id,
         v_selected_user_id,
         v_response_status,
         v_quoted_amount,
         v_proposed_delivery_at,
         v_proposed_delivery_timezone,
         v_proposed_duration_seconds,
         v_proposed_duration_value,
         v_proposed_duration_unit
  FROM public.request_responses rr
  WHERE rr.id = p_response_id
  FOR UPDATE;

  IF v_locked_request_id IS DISTINCT FROM v_request_id
     OR v_response_status IS DISTINCT FROM 'pending'::public.response_status THEN
    RAISE EXCEPTION 'this response is no longer available' USING errcode = '55000';
  END IF;

  IF v_proposed_duration_seconds IS NULL
     AND (
       v_proposed_delivery_at IS NULL
       OR v_proposed_delivery_timezone IS NULL
     ) THEN
    RAISE EXCEPTION 'this response is missing a proposed delivery term' USING errcode = '55000';
  END IF;

  v_agreed_provider_amount := coalesce(nullif(v_quoted_amount, 0), v_offered_amount);

  IF v_agreed_provider_amount IS NULL OR v_agreed_provider_amount <= 0 THEN
    RAISE EXCEPTION 'this request has no agreed payment amount' USING errcode = '55000';
  END IF;

  IF v_payment_structure = 'milestone'::public.payment_structure THEN
    v_proposal_id := public.resolve_milestone_proposal_for_accept(v_request_id, p_response_id);
    PERFORM public.validate_proposal_matches_total(v_proposal_id, v_agreed_provider_amount);
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
      accepted_at = v_accepted_at,
      start_by_at = v_accepted_at + public.request_engagement_start_window_interval(),
      accepted_response_id = p_response_id,
      selected_user_id = v_selected_user_id,
      agreed_provider_amount = v_agreed_provider_amount,
      proposed_delivery_at = v_proposed_delivery_at,
      proposed_delivery_timezone = v_proposed_delivery_timezone,
      proposed_delivery_duration_seconds = v_proposed_duration_seconds,
      proposed_delivery_duration_value = v_proposed_duration_value,
      proposed_delivery_duration_unit = v_proposed_duration_unit,
      adjusted_delivery_at = NULL,
      delivery_deadline_at = NULL
  WHERE id = v_request_id
    AND status IN (
      'posted'::public.request_status,
      'awaiting_review'::public.request_status
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'this request is no longer open for selection' USING errcode = '55000';
  END IF;

  IF v_payment_structure = 'milestone'::public.payment_structure THEN
    PERFORM public.snapshot_engagement_milestones(v_request_id, v_proposal_id);
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

CREATE OR REPLACE FUNCTION public.start_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_status public.request_status;
  v_requester_id uuid;
  v_payment_structure public.payment_structure;
  v_accepted_at timestamptz;
  v_start_by_at timestamptz;
  v_started_at timestamptz;
  v_proposed_delivery_at timestamptz;
  v_proposed_duration_seconds bigint;
  v_adjusted_delivery_at timestamptz;
  v_delivery_deadline_at timestamptz;
  v_helper_name text;
  v_helper_first text;
  v_first_milestone_id uuid;
  v_start_instant timestamptz;
BEGIN
  SELECT
    status,
    requester_id,
    payment_structure,
    accepted_at,
    start_by_at,
    started_at,
    proposed_delivery_at,
    proposed_delivery_duration_seconds,
    delivery_deadline_at
    INTO v_status,
         v_requester_id,
         v_payment_structure,
         v_accepted_at,
         v_start_by_at,
         v_started_at,
         v_proposed_delivery_at,
         v_proposed_duration_seconds,
         v_delivery_deadline_at
  FROM public.requests
  WHERE id = p_request_id AND selected_user_id = v_user_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_status = 'in_progress' THEN
    IF v_payment_structure = 'milestone'::public.payment_structure THEN
      UPDATE public.engagement_milestones
      SET status = 'in_progress'::public.milestone_status
      WHERE request_id = p_request_id
        AND position = 1
        AND status = 'pending'::public.milestone_status;
    END IF;
    RETURN;
  END IF;

  IF v_status <> 'accepted' THEN
    RAISE EXCEPTION 'only a selected request can be started' USING errcode = '55000';
  END IF;

  IF v_accepted_at IS NULL THEN
    RAISE EXCEPTION 'acceptance timestamp is missing' USING errcode = '55000';
  END IF;

  IF v_proposed_duration_seconds IS NULL AND v_proposed_delivery_at IS NULL THEN
    RAISE EXCEPTION 'proposed delivery term is missing' USING errcode = '55000';
  END IF;

  v_start_by_at := coalesce(v_start_by_at, v_accepted_at + public.request_engagement_start_window_interval());

  IF now() > v_start_by_at THEN
    RAISE EXCEPTION 'the start window has expired' USING errcode = '55000';
  END IF;

  v_start_instant := now();

  IF v_proposed_duration_seconds IS NOT NULL THEN
    v_adjusted_delivery_at :=
      v_start_instant + make_interval(secs => v_proposed_duration_seconds::double precision);
  ELSE
    v_adjusted_delivery_at := public.compute_shifted_delivery_deadline(
      v_proposed_delivery_at,
      v_accepted_at,
      v_start_instant
    );
  END IF;

  IF v_adjusted_delivery_at <= v_start_instant THEN
    RAISE EXCEPTION 'adjusted delivery deadline is not in the future' USING errcode = '55000';
  END IF;

  PERFORM public.assert_delivery_deadline_within_max_from_start(v_adjusted_delivery_at, v_start_instant);

  UPDATE public.requests
  SET status = 'in_progress'::public.request_status,
      started_at = coalesce(started_at, v_start_instant),
      start_by_at = v_start_by_at,
      adjusted_delivery_at = v_adjusted_delivery_at,
      delivery_deadline_at = v_adjusted_delivery_at
  WHERE id = p_request_id;

  PERFORM public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'in_progress'::public.request_status,
    'start:' || p_request_id::text
  );

  IF v_payment_structure = 'milestone'::public.payment_structure THEN
    SELECT em.id INTO v_first_milestone_id
    FROM public.engagement_milestones em
    WHERE em.request_id = p_request_id AND em.position = 1
    FOR UPDATE;

    IF v_first_milestone_id IS NULL THEN
      RAISE EXCEPTION 'milestone engagement is missing milestones' USING errcode = '55000';
    END IF;

    UPDATE public.engagement_milestones
    SET status = 'in_progress'::public.milestone_status
    WHERE id = v_first_milestone_id
      AND status = 'pending'::public.milestone_status;
  END IF;

  SELECT p.display_name INTO v_helper_name
  FROM public.profiles p
  WHERE p.id = v_user_id;

  v_helper_first := coalesce(public.display_first_name(v_helper_name), 'Your helper');

  PERFORM public.create_notification(
    v_requester_id,
    'request:' || p_request_id::text || ':started',
    'response_accepted'::public.notification_type,
    'In progress',
    format('%s has started helping you.', v_helper_first),
    format('/engagement/%s', p_request_id),
    p_request_id,
    NULL,
    NULL,
    NULL,
    v_user_id,
    NULL,
    true
  );
END;
$$;

DROP FUNCTION IF EXISTS public.list_request_responses(uuid);

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
  identity_verified boolean,
  message text,
  quoted_amount numeric,
  distance_m integer,
  status public.response_status,
  created_at timestamp with time zone,
  expires_at timestamp with time zone,
  proposed_delivery_at timestamp with time zone,
  proposed_delivery_timezone text,
  proposed_delivery_duration_seconds bigint,
  proposed_delivery_duration_value integer,
  proposed_delivery_duration_unit public.delivery_duration_unit,
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
    public.user_marketplace_identity_verified(p.id) AS identity_verified,
    rr.message,
    rr.quoted_amount,
    rr.distance_m,
    rr.status,
    rr.created_at,
    rr.expires_at,
    rr.proposed_delivery_at,
    rr.proposed_delivery_timezone,
    rr.proposed_delivery_duration_seconds,
    rr.proposed_delivery_duration_value,
    rr.proposed_delivery_duration_unit,
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
    rr.created_at DESC;
$$;

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
  requester_identity_verified boolean,
  attachment_path text,
  created_at timestamp with time zone,
  posted_at timestamp with time zone,
  proposed_delivery_at timestamp with time zone,
  proposed_delivery_timezone text,
  proposed_delivery_duration_seconds bigint,
  proposed_delivery_duration_value integer,
  proposed_delivery_duration_unit public.delivery_duration_unit
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
    public.user_marketplace_identity_verified(p.id),
    r.attachment_path,
    rr.created_at,
    r.created_at,
    rr.proposed_delivery_at,
    rr.proposed_delivery_timezone,
    rr.proposed_delivery_duration_seconds,
    rr.proposed_delivery_duration_value,
    rr.proposed_delivery_duration_unit
  FROM me
  JOIN public.request_responses rr ON rr.responder_id = me.user_id
  JOIN public.requests r ON r.id = rr.request_id
  JOIN public.profiles p ON p.id = r.requester_id
  ORDER BY rr.created_at DESC;
$$;

DROP FUNCTION IF EXISTS public.get_engagement(uuid);

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
  start_by_at timestamp with time zone,
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
  counterparty_identity_verified boolean,
  rating_stars smallint,
  rating_comment text,
  viewer_has_rated boolean,
  handshake_id uuid,
  handshake_at timestamp with time zone,
  tag_slugs text[],
  proposed_delivery_at timestamp with time zone,
  proposed_delivery_timezone text,
  proposed_delivery_duration_seconds bigint,
  proposed_delivery_duration_value integer,
  proposed_delivery_duration_unit public.delivery_duration_unit,
  adjusted_delivery_at timestamp with time zone,
  delivery_deadline_at timestamp with time zone
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
    r.start_by_at,
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
    public.user_marketplace_identity_verified(counterparty.id),
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
    public.request_tag_slugs(r.id),
    r.proposed_delivery_at,
    r.proposed_delivery_timezone,
    r.proposed_delivery_duration_seconds,
    r.proposed_delivery_duration_value,
    r.proposed_delivery_duration_unit,
    r.adjusted_delivery_at,
    r.delivery_deadline_at
  FROM me
  JOIN public.requests r
    ON r.id = p_request_id
   AND r.status IN (
     'accepted',
     'in_progress',
     'completion_pending',
     'completed',
     'disputed',
     'no_show',
     'cancelled'
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

GRANT ALL ON FUNCTION public.respond_to_request(
  uuid,
  text,
  numeric,
  double precision,
  double precision,
  integer,
  public.delivery_duration_unit
) TO authenticated;
GRANT ALL ON FUNCTION public.respond_to_request(
  uuid,
  text,
  numeric,
  double precision,
  double precision,
  integer,
  public.delivery_duration_unit
) TO service_role;

GRANT ALL ON FUNCTION public.list_request_responses(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.list_request_responses(uuid) TO service_role;

GRANT ALL ON FUNCTION public.my_responses() TO authenticated;
GRANT ALL ON FUNCTION public.my_responses() TO service_role;

GRANT ALL ON FUNCTION public.get_engagement(uuid) TO anon;
GRANT ALL ON FUNCTION public.get_engagement(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_engagement(uuid) TO service_role;