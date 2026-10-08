-- Tag-interest request alerts: explicit request_tags only, browse-equivalent relevance, one per user.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS discovery_location extensions.geography(Point, 4326),
  ADD COLUMN IF NOT EXISTS discovery_location_updated_at timestamptz;

COMMENT ON COLUMN public.profiles.discovery_location IS
  'Last coordinates used for nearby discovery (browse/respond).';

CREATE OR REPLACE FUNCTION public.record_discovery_coordinates(
  p_latitude double precision,
  p_longitude double precision
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_location extensions.geography := public.assert_coordinates(p_latitude, p_longitude);
BEGIN
  UPDATE public.profiles
  SET discovery_location = v_location,
      discovery_location_updated_at = now()
  WHERE id = v_user_id;
END;
$$;

GRANT ALL ON FUNCTION public.record_discovery_coordinates(double precision, double precision) TO authenticated;
GRANT ALL ON FUNCTION public.record_discovery_coordinates(double precision, double precision) TO service_role;

CREATE OR REPLACE FUNCTION public.request_discoverable_for_user(
  p_request_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.requests r
    JOIN public.profiles viewer ON viewer.id = p_user_id
    WHERE r.id = p_request_id
      AND r.status = 'posted'
      AND r.expires_at > now()
      AND r.offered_amount IS NOT NULL
      AND r.offered_amount > 0
      AND r.payment_status = 'locked'::public.payment_status
      AND r.requester_id <> p_user_id
      AND viewer.discovery_location IS NOT NULL
      AND extensions.ST_DWithin(
        r.location,
        viewer.discovery_location,
        public.discovery_radius_m()
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.request_responses rr
        WHERE rr.request_id = r.id
          AND rr.responder_id = p_user_id
          AND rr.status IN (
            'pending'::public.response_status,
            'accepted'::public.response_status,
            'declined'::public.response_status
          )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.request_discoverable_for_user(uuid, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_discoverable_for_user(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_tag_interest_subscribers(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_requester_id uuid;
  v_title text;
  v_status public.request_status;
  v_payment public.payment_status;
  v_recipient_id uuid;
  v_body text;
  v_metadata jsonb := jsonb_build_object('link', 'respond', 'role', 'helper');
BEGIN
  SELECT r.requester_id, r.title, r.status, r.payment_status
  INTO v_requester_id, v_title, v_status, v_payment
  FROM public.requests r
  WHERE r.id = p_request_id;

  IF v_requester_id IS NULL
     OR v_status <> 'posted'
     OR v_payment <> 'locked'::public.payment_status THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.request_tags rt WHERE rt.request_id = p_request_id
  ) THEN
    RETURN;
  END IF;

  v_body := format('"%s" matches your interests.', left(btrim(v_title), 120));

  FOR v_recipient_id IN
    SELECT DISTINCT u.user_id
    FROM public.user_notification_tag_interests u
    INNER JOIN public.request_tags rt
      ON rt.request_id = p_request_id
     AND rt.tag_id = u.tag_id
    WHERE u.user_id <> v_requester_id
      AND public.request_discoverable_for_user(p_request_id, u.user_id)
  LOOP
    PERFORM public.create_notification(
      v_recipient_id,
      'request:' || p_request_id::text || ':tag_interest',
      'matching_request'::public.notification_type,
      'Request you might want',
      v_body,
      format('/respond/%s', p_request_id),
      p_request_id,
      NULL,
      NULL,
      NULL,
      v_requester_id,
      v_metadata,
      true
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.browse_nearby_requests(
  p_latitude double precision,
  p_longitude double precision
)
RETURNS TABLE(
  request_id uuid,
  title text,
  description text,
  scheduled_for timestamp with time zone,
  offered_amount numeric,
  currency text,
  location_label text,
  distance_m integer,
  requester_display_name text,
  requester_avatar_path text,
  requester_rating_average numeric,
  requester_rating_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH viewer AS (
    SELECT
      public.assert_onboarded() AS user_id,
      public.assert_coordinates(p_latitude, p_longitude) AS location
  ),
  _discovery AS (
    SELECT public.record_discovery_coordinates(p_latitude, p_longitude)
  )
  SELECT
    r.id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(extensions.ST_Distance(r.location, viewer.location)),
    p.display_name,
    p.avatar_path,
    p.rating_average,
    p.rating_count
  FROM viewer
  CROSS JOIN _discovery
  JOIN public.requests r
    ON r.status = 'posted'
   AND r.expires_at > now()
   AND r.offered_amount IS NOT NULL
   AND r.offered_amount > 0
   AND r.payment_status = 'locked'::public.payment_status
   AND r.requester_id <> viewer.user_id
   AND extensions.ST_DWithin(r.location, viewer.location, public.discovery_radius_m())
   AND NOT EXISTS (
     SELECT 1
     FROM public.request_responses rr
     WHERE rr.request_id = r.id
       AND rr.responder_id = viewer.user_id
       AND rr.status IN (
         'pending'::public.response_status,
         'accepted'::public.response_status,
         'declined'::public.response_status
       )
   )
  JOIN public.profiles p ON p.id = r.requester_id
  ORDER BY extensions.ST_Distance(r.location, viewer.location) ASC, r.created_at DESC
  LIMIT 40;
$$;

CREATE OR REPLACE FUNCTION public.browse_request(
  p_request_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
RETURNS TABLE(
  request_id uuid,
  title text,
  description text,
  scheduled_for timestamp with time zone,
  offered_amount numeric,
  currency text,
  location_label text,
  distance_m integer,
  requester_id uuid,
  requester_display_name text,
  requester_avatar_path text,
  requester_bio text,
  requester_rating_average numeric,
  requester_rating_count integer,
  requester_completion_percent integer,
  attachment_path text,
  tag_slugs text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH viewer AS (
    SELECT
      public.assert_onboarded() AS user_id,
      public.assert_coordinates(p_latitude, p_longitude) AS location
  ),
  _discovery AS (
    SELECT public.record_discovery_coordinates(p_latitude, p_longitude)
  )
  SELECT
    r.id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(extensions.ST_Distance(r.location, viewer.location)),
    r.requester_id,
    p.display_name,
    p.avatar_path,
    p.bio,
    p.rating_average,
    p.rating_count,
    public.requester_completion_percent(r.requester_id),
    r.attachment_path,
    public.request_tag_slugs(r.id)
  FROM viewer
  CROSS JOIN _discovery
  JOIN public.requests r
    ON r.id = p_request_id
   AND r.status = 'posted'
   AND r.expires_at > now()
   AND r.offered_amount IS NOT NULL
   AND r.offered_amount > 0
   AND r.payment_status = 'locked'::public.payment_status
   AND r.requester_id <> viewer.user_id
   AND extensions.ST_DWithin(r.location, viewer.location, public.discovery_radius_m())
   AND NOT EXISTS (
     SELECT 1
     FROM public.request_responses rr
     WHERE rr.request_id = r.id
       AND rr.responder_id = viewer.user_id
       AND rr.status IN (
         'pending'::public.response_status,
         'accepted'::public.response_status,
         'declined'::public.response_status
       )
   )
  JOIN public.profiles p ON p.id = r.requester_id;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_request(
  p_request_id uuid,
  p_message text DEFAULT NULL,
  p_quoted_amount numeric DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_distance_m integer;
  v_response_id uuid;
  v_request_expires_at timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.avatar_path IS NOT NULL
      AND p.avatar_captured_in_app
  ) THEN
    RAISE EXCEPTION 'add a profile photo in the app before responding' USING errcode = '55000';
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

  SELECT r.expires_at INTO v_request_expires_at
  FROM public.requests r
  WHERE r.id = p_request_id;

  INSERT INTO public.request_responses (
    request_id,
    responder_id,
    message,
    quoted_amount,
    distance_m,
    expires_at
  )
  VALUES (
    p_request_id,
    v_user_id,
    nullif(btrim(p_message), ''),
    p_quoted_amount,
    v_distance_m,
    v_request_expires_at
  )
  ON CONFLICT (request_id, responder_id) DO UPDATE
  SET message = excluded.message,
      quoted_amount = excluded.quoted_amount,
      distance_m = excluded.distance_m,
      expires_at = excluded.expires_at
  WHERE public.request_responses.status = 'pending'
  RETURNING id INTO v_response_id;

  IF v_response_id IS NULL THEN
    RAISE EXCEPTION 'you already have a response on this request' USING errcode = '55000';
  END IF;

  RETURN v_response_id;
END;
$$;
