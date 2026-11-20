-- One respond_to_request overload (PostgREST cannot choose between 5-arg and duration-aware versions).
-- Skip discovery coordinate write when editing a pending response without fresh location.

DROP FUNCTION IF EXISTS public.respond_to_request(
  uuid,
  text,
  numeric,
  double precision,
  double precision
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
  v_inserted boolean;
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

REVOKE ALL ON FUNCTION public.respond_to_request(
  uuid,
  text,
  numeric,
  double precision,
  double precision,
  integer,
  public.delivery_duration_unit
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.respond_to_request(
  uuid,
  text,
  numeric,
  double precision,
  double precision,
  integer,
  public.delivery_duration_unit
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.respond_to_request(
  uuid,
  text,
  numeric,
  double precision,
  double precision,
  integer,
  public.delivery_duration_unit
) TO service_role;