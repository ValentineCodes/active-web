-- Request editing: eligibility from current response state and acceptance history (not first_response_at).

COMMENT ON COLUMN public.requests.first_response_at IS
  'Historical: first response row created_at. Not used for edit eligibility.';

DROP TRIGGER IF EXISTS request_responses_record_first_response ON public.request_responses;
DROP FUNCTION IF EXISTS public.record_first_response_submitted();

DROP VIEW IF EXISTS public.my_requests;

DROP FUNCTION IF EXISTS public.request_allows_requester_edit(
  public.request_status,
  timestamp with time zone,
  timestamp with time zone
);

CREATE OR REPLACE FUNCTION public.request_allows_requester_edit(
  p_status public.request_status,
  p_expires_at timestamp with time zone,
  p_accepted_at timestamp with time zone,
  p_request_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT
    p_accepted_at IS NULL
    AND p_status IN (
      'posted'::public.request_status,
      'searching'::public.request_status
    )
    AND p_expires_at IS NOT NULL
    AND p_expires_at > now()
    AND NOT EXISTS (
      SELECT 1
      FROM public.request_responses rr
      WHERE rr.request_id = p_request_id
        AND rr.status = 'pending'::public.response_status
    );
$$;

CREATE OR REPLACE FUNCTION public.update_request(
  p_request_id uuid,
  p_title text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_scheduled_for timestamp with time zone DEFAULT NULL,
  p_offered_amount numeric DEFAULT NULL,
  p_attachment_path text DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_description text := nullif(btrim(p_description), '');
  v_request public.requests%rowtype;
  v_rows integer;
  v_new_expires_at timestamptz;
BEGIN
  IF char_length(btrim(p_title)) < 3 OR char_length(btrim(p_title)) > 120 THEN
    RAISE EXCEPTION 'title must be between 3 and 120 characters' USING errcode = '22023';
  END IF;

  IF v_description IS NULL
     OR char_length(v_description) < 1
     OR char_length(v_description) > 1000 THEN
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

  IF p_attachment_path IS NOT NULL AND btrim(p_attachment_path) <> '' THEN
    IF split_part(p_attachment_path, '/', 1) <> v_user_id::text
       OR split_part(p_attachment_path, '/', 2) <> 'drafts' THEN
      RAISE EXCEPTION 'invalid attachment path' USING errcode = '22023';
    END IF;
  END IF;

  SELECT * INTO v_request
  FROM public.requests r
  WHERE r.id = p_request_id
    AND r.requester_id = v_user_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF NOT public.request_allows_requester_edit(
    v_request.status,
    v_request.expires_at,
    v_request.accepted_at,
    p_request_id
  ) THEN
    RAISE EXCEPTION 'this request can no longer be edited' USING errcode = '55000';
  END IF;

  IF p_scheduled_for IS NOT DISTINCT FROM v_request.scheduled_for THEN
    v_new_expires_at := v_request.expires_at;
  ELSE
    v_new_expires_at := public.request_expires_at(p_scheduled_for);
  END IF;

  UPDATE public.requests
  SET title = btrim(p_title),
      description = v_description,
      scheduled_for = p_scheduled_for,
      offered_amount = p_offered_amount,
      attachment_path = CASE
        WHEN p_attachment_path IS NOT NULL AND btrim(p_attachment_path) = '' THEN NULL
        ELSE COALESCE(p_attachment_path, attachment_path)
      END,
      expires_at = v_new_expires_at,
      updated_at = now()
  WHERE id = p_request_id
    AND requester_id = v_user_id
    AND accepted_at IS NULL
    AND status IN (
      'posted'::public.request_status,
      'searching'::public.request_status
    )
    AND expires_at > now()
    AND NOT EXISTS (
      SELECT 1
      FROM public.request_responses rr
      WHERE rr.request_id = p_request_id
        AND rr.status = 'pending'::public.response_status
    );

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'this request can no longer be edited' USING errcode = '55000';
  END IF;

  IF v_new_expires_at IS DISTINCT FROM v_request.expires_at THEN
    UPDATE public.request_responses rr
    SET expires_at = v_new_expires_at
    WHERE rr.request_id = p_request_id
      AND rr.status = 'pending'::public.response_status;
  END IF;

  DELETE FROM public.request_tags WHERE request_id = p_request_id;
  PERFORM public.attach_tags_to_request(p_request_id, p_tag_ids);

  IF p_offered_amount IS DISTINCT FROM v_request.offered_amount
     AND v_request.payment_status = 'locked'::public.payment_status THEN
    PERFORM public.align_request_escrow_to_agreed_amount(
      p_request_id,
      p_offered_amount,
      'update:' || p_request_id::text
    );
  END IF;
END;
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
  v_request public.requests%rowtype;
  v_distance_m integer;
  v_response_id uuid;
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
    expires_at
  )
  VALUES (
    p_request_id,
    v_user_id,
    nullif(btrim(p_message), ''),
    p_quoted_amount,
    v_distance_m,
    v_request.expires_at
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
    public.request_tag_slugs(r.id) AS tag_slugs,
    ( SELECT (count(*))::integer AS count
           FROM public.request_responses rr
          WHERE ((rr.request_id = r.id) AND (rr.status = 'pending'::public.response_status))) AS pending_response_count,
    r.first_response_at,
    public.request_allows_requester_edit(r.status, r.expires_at, r.accepted_at, r.id) AS is_editable,
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

COMMENT ON FUNCTION public.update_request(
  uuid, text, text, double precision, double precision, text,
  timestamp with time zone, numeric, text, uuid[]
) IS
  'Requester edit for open requests with no pending responses and no prior acceptance. Does not change created_at/submitted_at, status, location, or payment_status; escrow adjusts only when offered_amount changes.';
