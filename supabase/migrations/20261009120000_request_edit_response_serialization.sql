-- Serialize request edits against the first successful response insert via row-level locks.

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
  v_location extensions.geography := public.assert_coordinates(p_latitude, p_longitude);
  v_description text := nullif(btrim(p_description), '');
  v_request public.requests%rowtype;
  v_rows integer;
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
    v_request.first_response_at
  ) THEN
    RAISE EXCEPTION 'this request can no longer be edited' USING errcode = '55000';
  END IF;

  UPDATE public.requests
  SET title = btrim(p_title),
      description = v_description,
      scheduled_for = p_scheduled_for,
      offered_amount = p_offered_amount,
      location = v_location,
      location_label = btrim(p_location_label),
      attachment_path = CASE
        WHEN p_attachment_path IS NOT NULL AND btrim(p_attachment_path) = '' THEN NULL
        ELSE COALESCE(p_attachment_path, attachment_path)
      END,
      expires_at = public.request_expires_at(p_scheduled_for),
      updated_at = now()
  WHERE id = p_request_id
    AND requester_id = v_user_id
    AND first_response_at IS NULL
    AND status IN (
      'posted'::public.request_status,
      'searching'::public.request_status
    )
    AND expires_at > now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'this request can no longer be edited' USING errcode = '55000';
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
  v_inserted boolean;
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
  RETURNING id, (xmax = 0) INTO v_response_id, v_inserted;

  IF v_response_id IS NULL THEN
    RAISE EXCEPTION 'you already have a response on this request' USING errcode = '55000';
  END IF;

  IF v_inserted THEN
    UPDATE public.requests
    SET first_response_at = COALESCE(first_response_at, now())
    WHERE id = p_request_id;
  END IF;

  RETURN v_response_id;
END;
$$;
