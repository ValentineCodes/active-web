-- Optional single photo on a request (storage path in request-media bucket).

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS attachment_path text;

ALTER TABLE public.requests
  DROP CONSTRAINT IF EXISTS requests_attachment_path_owner;

ALTER TABLE public.requests
  ADD CONSTRAINT requests_attachment_path_owner CHECK (
    attachment_path IS NULL
    OR (
      split_part(attachment_path, '/', 1) = requester_id::text
      AND split_part(attachment_path, '/', 2) = 'drafts'
    )
  );

CREATE OR REPLACE FUNCTION public.request_media_visible_to_party(
  p_user_id uuid,
  p_name text
) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.service_problems sp
    JOIN public.requests r ON r.id = sp.request_id
    WHERE p_name = ANY (sp.evidence_paths)
      AND (r.requester_id = p_user_id OR r.selected_user_id = p_user_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.requests r
    WHERE r.attachment_path = p_name
      AND (
        r.requester_id = p_user_id
        OR r.selected_user_id = p_user_id
        OR EXISTS (
          SELECT 1
          FROM public.request_responses rr
          WHERE rr.request_id = r.id
            AND rr.responder_id = p_user_id
        )
        OR (
          r.status = 'posted'
          AND r.expires_at > now()
          AND r.requester_id <> p_user_id
        )
      )
  );
$$;

DROP FUNCTION IF EXISTS public.create_request(
  text, text, double precision, double precision, text,
  timestamp with time zone, numeric, uuid
);

CREATE OR REPLACE FUNCTION public.create_request(
  p_title text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_scheduled_for timestamp with time zone DEFAULT NULL,
  p_offered_amount numeric DEFAULT NULL,
  p_source_request_id uuid DEFAULT NULL,
  p_attachment_path text DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_location extensions.geography := public.assert_coordinates(p_latitude, p_longitude);
  v_description text := nullif(btrim(p_description), '');
  v_request_id uuid;
  v_payment public.payment_status;
  v_source public.requests%rowtype;
  v_charge record;
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
      OR (v_source.status = 'posted' AND v_source.expires_at <= now())
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

  SELECT * INTO v_charge FROM public.compute_request_charge(p_offered_amount);

  PERFORM public.ensure_wallet_account(v_user_id);

  IF (
    SELECT wa.available
    FROM public.wallet_accounts wa
    WHERE wa.user_id = v_user_id
  ) < v_charge.total THEN
    RAISE EXCEPTION 'insufficient wallet balance to fund this request' USING errcode = '55000';
  END IF;

  v_payment := 'not_required';

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
    v_payment,
    v_location,
    btrim(p_location_label),
    'posted',
    now(),
    public.request_expires_at(p_scheduled_for),
    p_source_request_id,
    p_attachment_path
  )
  RETURNING id INTO v_request_id;

  PERFORM public.lock_request_escrow(v_request_id, 'create:' || v_request_id::text);

  RETURN v_request_id;
END;
$$;

GRANT ALL ON FUNCTION public.create_request(
  text, text, double precision, double precision, text,
  timestamp with time zone, numeric, uuid, text
) TO anon;
GRANT ALL ON FUNCTION public.create_request(
  text, text, double precision, double precision, text,
  timestamp with time zone, numeric, uuid, text
) TO authenticated;
GRANT ALL ON FUNCTION public.create_request(
  text, text, double precision, double precision, text,
  timestamp with time zone, numeric, uuid, text
) TO service_role;

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
        CASE
            WHEN ((r.status = 'posted'::public.request_status) AND (r.expires_at <= now())) THEN 'expired'::public.request_status
            ELSE r.status
        END AS status,
    r.selected_user_id,
    r.source_request_id,
    r.attachment_path,
    ( SELECT (count(*))::integer AS count
           FROM public.request_responses rr
          WHERE ((rr.request_id = r.id) AND (rr.status = 'pending'::public.response_status))) AS pending_response_count,
    (EXISTS ( SELECT 1
           FROM public.ratings g
          WHERE ((g.request_id = r.id) AND (g.rater_id = ( SELECT auth.uid() AS uid))))) AS is_rated,
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
  WHERE (r.requester_id = ( SELECT auth.uid() AS uid));

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
  created_at timestamp with time zone
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
    CASE
      WHEN r.status = 'posted' AND r.expires_at <= now() THEN 'expired'::public.request_status
      ELSE r.status
    END,
    rr.decline_reason,
    r.requester_id,
    p.display_name,
    p.avatar_path,
    p.bio,
    p.rating_average,
    p.rating_count,
    public.requester_completion_percent(r.requester_id),
    r.attachment_path,
    rr.created_at
  FROM me
  JOIN public.request_responses rr ON rr.responder_id = me.user_id
  JOIN public.requests r ON r.id = rr.request_id
  JOIN public.profiles p ON p.id = r.requester_id
  ORDER BY rr.created_at DESC;
$$;

GRANT ALL ON FUNCTION public.my_responses() TO anon;
GRANT ALL ON FUNCTION public.my_responses() TO authenticated;
GRANT ALL ON FUNCTION public.my_responses() TO service_role;

DROP FUNCTION IF EXISTS public.browse_request(uuid, double precision, double precision);

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
  attachment_path text
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
    r.attachment_path
  FROM viewer
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

GRANT ALL ON FUNCTION public.browse_request(uuid, double precision, double precision) TO anon;
GRANT ALL ON FUNCTION public.browse_request(uuid, double precision, double precision) TO authenticated;
GRANT ALL ON FUNCTION public.browse_request(uuid, double precision, double precision) TO service_role;
