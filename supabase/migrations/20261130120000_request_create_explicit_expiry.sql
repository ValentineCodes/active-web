-- Request creation: explicit expires_at (decoupled from scheduled_for).

CREATE OR REPLACE FUNCTION public.request_expiry_at(
  p_local_date date,
  p_timezone text DEFAULT 'Africa/Lagos',
  p_local_time time DEFAULT time '23:59:59'
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_local timestamp without time zone;
BEGIN
  PERFORM public.assert_valid_iana_timezone(p_timezone);
  v_local := p_local_date + coalesce(p_local_time, time '23:59:59');
  RETURN v_local AT TIME ZONE p_timezone;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_expiry_at(date, text, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_expiry_at(date, text, time) TO service_role;

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
  p_tag_ids uuid[] DEFAULT '{}'::uuid[],
  p_payment_structure public.payment_structure DEFAULT 'single',
  p_milestones jsonb DEFAULT NULL,
  p_expires_at timestamp with time zone DEFAULT NULL
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
  v_proposal_id uuid;
  v_expires_at timestamptz;
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

  IF p_payment_structure = 'milestone'::public.payment_structure THEN
    IF p_milestones IS NULL THEN
      RAISE EXCEPTION 'milestone requests require milestones' USING errcode = '22023';
    END IF;
    IF NOT public.milestone_items_sum_matches_total(p_milestones, p_offered_amount) THEN
      RAISE EXCEPTION 'milestone amounts must equal the offer total' USING errcode = '22023';
    END IF;
  ELSIF p_milestones IS NOT NULL THEN
    RAISE EXCEPTION 'milestones are only allowed for milestone payment structure' USING errcode = '22023';
  END IF;

  IF p_scheduled_for IS NOT NULL AND p_scheduled_for < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'scheduled time is in the past' USING errcode = '22023';
  END IF;

  IF p_scheduled_for IS NOT NULL AND p_scheduled_for > now() + interval '30 days' THEN
    RAISE EXCEPTION 'scheduled time is too far in the future' USING errcode = '22023';
  END IF;

  v_expires_at := coalesce(p_expires_at, public.request_expires_at(p_scheduled_for));

  IF v_expires_at IS NULL OR v_expires_at <= now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'response deadline must be at least 5 minutes in the future' USING errcode = '22023';
  END IF;

  IF v_expires_at > now() + interval '30 days' THEN
    RAISE EXCEPTION 'response deadline is too far in the future' USING errcode = '22023';
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
    payment_structure,
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
    p_payment_structure,
    v_location,
    btrim(p_location_label),
    'posted',
    now(),
    v_expires_at,
    p_source_request_id,
    p_attachment_path
  )
  RETURNING id INTO v_request_id;

  PERFORM public.attach_tags_to_request(v_request_id, p_tag_ids);

  IF p_payment_structure = 'milestone'::public.payment_structure THEN
    INSERT INTO public.request_milestone_proposals (request_id, response_id, status)
    VALUES (v_request_id, NULL, 'draft'::public.milestone_proposal_status)
    RETURNING id INTO v_proposal_id;

    PERFORM public.replace_milestone_proposal_items(v_proposal_id, p_milestones);
  END IF;

  PERFORM public.notify_tag_interest_subscribers(v_request_id);

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_request(
  text,
  text,
  double precision,
  double precision,
  text,
  timestamp with time zone,
  numeric,
  uuid,
  text,
  uuid[],
  public.payment_structure,
  jsonb,
  timestamp with time zone
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_request(
  text,
  text,
  double precision,
  double precision,
  text,
  timestamp with time zone,
  numeric,
  uuid,
  text,
  uuid[],
  public.payment_structure,
  jsonb,
  timestamp with time zone
) TO service_role;