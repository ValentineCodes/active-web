-- Cancelling a pending response deletes the row so the helper can respond again.
-- Declined responses block re-entry; withdrawn rows are removed from product surfaces.

DELETE FROM public.request_responses rr
WHERE rr.status = 'withdrawn'::public.response_status
  AND NOT EXISTS (
    SELECT 1
    FROM public.handshakes h
    WHERE h.response_id = rr.id
  );

CREATE OR REPLACE FUNCTION public.withdraw_response(p_response_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_deleted uuid;
BEGIN
  DELETE FROM public.request_responses
  WHERE id = p_response_id
    AND responder_id = v_user_id
    AND status = 'pending'::public.response_status
  RETURNING id INTO v_deleted;

  IF v_deleted IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.request_responses rr
      WHERE rr.id = p_response_id
        AND rr.responder_id = v_user_id
        AND rr.status = 'declined'::public.response_status
    ) THEN
      RAISE EXCEPTION 'you were not chosen for this request' USING errcode = '55000';
    END IF;

    RAISE EXCEPTION 'this response can no longer be cancelled' USING errcode = '55000';
  END IF;
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
  WHERE rr.status <> 'withdrawn'::public.response_status
  ORDER BY rr.created_at DESC;
$$;

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
  v_inserted boolean;
BEGIN
  v_duration_seconds := public.assert_valid_proposed_delivery_duration(
    p_proposed_delivery_duration_value,
    p_proposed_delivery_duration_unit
  );

  IF EXISTS (
    SELECT 1
    FROM public.request_responses rr
    WHERE rr.request_id = p_request_id
      AND rr.responder_id = v_user_id
      AND rr.status = 'declined'::public.response_status
  ) THEN
    RAISE EXCEPTION 'you were not chosen for this request' USING errcode = '55000';
  END IF;

  DELETE FROM public.request_responses rr
  WHERE rr.request_id = p_request_id
    AND rr.responder_id = v_user_id
    AND rr.status = 'withdrawn'::public.response_status;

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

  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
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
  ELSE
    SELECT rr.distance_m
      INTO v_distance_m
    FROM public.request_responses rr
    WHERE rr.request_id = p_request_id
      AND rr.responder_id = v_user_id
      AND rr.status = 'pending'::public.response_status;

    IF v_distance_m IS NULL THEN
      RAISE EXCEPTION 'location is required to respond' USING errcode = '55000';
    END IF;
  END IF;

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
  RETURNING id, (xmax = 0) INTO v_response_id, v_inserted;

  IF v_response_id IS NULL THEN
    RAISE EXCEPTION 'you already have a response on this request' USING errcode = '55000';
  END IF;

  IF v_inserted THEN
    UPDATE public.requests
    SET first_response_at = coalesce(first_response_at, now())
    WHERE id = p_request_id;
  END IF;

  RETURN v_response_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.withdraw_response(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_response(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.list_request_responses(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_request_responses(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.my_responses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_responses() TO service_role;