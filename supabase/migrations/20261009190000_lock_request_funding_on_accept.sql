-- Lock request funds when the requester accepts a responder, not when posting.

CREATE OR REPLACE FUNCTION public.lock_request_escrow_for_amount(
  p_request_id uuid,
  p_offer_amount numeric,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request public.requests%rowtype;
  v_charge record;
  v_lock_ref text;
  v_fund_key text;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  IF p_offer_amount IS NULL OR p_offer_amount <= 0 THEN
    RAISE EXCEPTION 'offer amount must be greater than zero' USING errcode = '22023';
  END IF;

  v_fund_key := p_idempotency_key || ':fund';

  IF EXISTS (
    SELECT 1
    FROM public.payment_transitions pt
    WHERE pt.request_id = p_request_id
      AND pt.idempotency_key = v_fund_key
      AND pt.to_status = 'locked'::public.payment_status
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_request
  FROM public.requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_request.payment_status <> 'not_required'::public.payment_status THEN
    RAISE EXCEPTION 'request funds cannot be locked in the current payment state'
      USING errcode = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payment_locks pl
    WHERE pl.request_id = p_request_id
      AND pl.status = 'active'::public.payment_lock_status
  ) THEN
    RAISE EXCEPTION 'funds are already locked for this request' USING errcode = '55000';
  END IF;

  SELECT * INTO v_charge FROM public.compute_request_charge(p_offer_amount);

  v_lock_ref := p_idempotency_key || ':escrow_lock';

  PERFORM public.wallet_lock_funds_kobo(
    v_lock_ref,
    v_request.requester_id,
    p_request_id,
    public.ngn_major_to_kobo(v_charge.provider_amount),
    public.ngn_major_to_kobo(v_charge.service_fee),
    public.ngn_major_to_kobo(v_charge.total),
    v_request.currency
  );

  PERFORM public.apply_payment_transition(
    p_request_id,
    'locked'::public.payment_status,
    v_fund_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lock_request_escrow_for_amount(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_request_escrow_for_amount(uuid, numeric, text) TO service_role;

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
      AND r.payment_status IN (
        'not_required'::public.payment_status,
        'locked'::public.payment_status
      )
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

CREATE OR REPLACE FUNCTION public.notify_tag_interest_subscribers(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_requester_id uuid;
  v_request_title text;
  v_status public.request_status;
  v_payment public.payment_status;
  v_recipient_id uuid;
  v_body text;
  v_notification_title text := 'New request nearby';
  v_metadata jsonb := jsonb_build_object('link', 'respond', 'role', 'helper');
BEGIN
  SELECT r.requester_id, left(btrim(r.title), 120), r.status, r.payment_status
  INTO v_requester_id, v_request_title, v_status, v_payment
  FROM public.requests r
  WHERE r.id = p_request_id;

  IF v_requester_id IS NULL
     OR v_status <> 'posted'
     OR v_payment NOT IN (
       'not_required'::public.payment_status,
       'locked'::public.payment_status
     ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.request_tags rt WHERE rt.request_id = p_request_id
  ) THEN
    RETURN;
  END IF;

  IF v_request_title IS NOT NULL AND char_length(v_request_title) >= 3 THEN
    v_notification_title := 'New request';
  END IF;

  FOR v_recipient_id IN
    SELECT DISTINCT u.user_id
    FROM public.user_notification_tag_interests u
    INNER JOIN public.request_tags rt
      ON rt.request_id = p_request_id
     AND rt.tag_id = u.tag_id
    WHERE u.user_id <> v_requester_id
      AND public.request_discoverable_for_user(p_request_id, v_recipient_id)
  LOOP
    v_body := public.matching_request_notification_body(p_request_id, v_recipient_id);

    PERFORM public.create_notification(
      v_recipient_id,
      'request:' || p_request_id::text || ':tag_interest',
      'matching_request'::public.notification_type,
      v_notification_title,
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

  IF v_request_status <> 'posted' THEN
    RAISE EXCEPTION 'this request is no longer open for selection' USING errcode = '55000';
  END IF;

  IF v_request_expires_at <= now() THEN
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
    AND status = 'posted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'this request is no longer open for selection' USING errcode = '55000';
  END IF;

  PERFORM public.set_user_attendance(v_selected_user_id, v_request_id);

  INSERT INTO public.handshakes (request_id, response_id, requester_id, selected_user_id)
  VALUES (v_request_id, p_response_id, v_requester_id, v_selected_user_id);

  PERFORM public.ensure_request_conversation(
    v_request_id,
    v_requester_id,
    v_selected_user_id
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
    null,
    null,
    v_requester_id,
    null,
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

-- Discovery: posted offers are visible before wallet funds are locked.

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
  JOIN public.requests r
    ON r.status = 'posted'
   AND r.expires_at > now()
   AND r.offered_amount IS NOT NULL
   AND r.offered_amount > 0
   AND r.payment_status IN (
     'not_required'::public.payment_status,
     'locked'::public.payment_status
   )
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
  ORDER BY extensions.ST_Distance(r.location, viewer.location) ASC, r.created_at DESC;
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
  tag_slugs text[],
  posted_at timestamp with time zone,
  respond_allowed boolean
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
    r.attachment_path,
    public.request_tag_slugs(r.id),
    r.created_at,
    extensions.ST_DWithin(r.location, viewer.location, public.discovery_radius_m())
  FROM viewer
  JOIN public.requests r
    ON r.id = p_request_id
   AND r.status = 'posted'
   AND r.expires_at > now()
   AND r.offered_amount IS NOT NULL
   AND r.offered_amount > 0
   AND r.payment_status IN (
     'not_required'::public.payment_status,
     'locked'::public.payment_status
   )
   AND r.requester_id <> viewer.user_id
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

CREATE OR REPLACE FUNCTION public.search_requests(
  p_query text,
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
  needle AS (
    SELECT btrim(coalesce(p_query, '')) AS q
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
  CROSS JOIN needle
  JOIN public.requests r
    ON needle.q <> ''
   AND r.status = 'posted'
   AND r.expires_at > now()
   AND r.offered_amount IS NOT NULL
   AND r.offered_amount > 0
   AND r.payment_status IN (
     'not_required'::public.payment_status,
     'locked'::public.payment_status
   )
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
   AND (
     r.title ILIKE '%' || needle.q || '%'
     OR r.description ILIKE '%' || needle.q || '%'
     OR EXISTS (
       SELECT 1
       FROM public.request_tags rt
       INNER JOIN public.tags t ON t.id = rt.tag_id
       WHERE rt.request_id = r.id
         AND t.is_active
         AND (
           t.name ILIKE '%' || needle.q || '%'
           OR t.slug ILIKE '%' || regexp_replace(needle.q, '^#', '') || '%'
         )
     )
   )
  JOIN public.profiles p ON p.id = r.requester_id
  ORDER BY extensions.ST_Distance(r.location, viewer.location) ASC, r.created_at DESC
  LIMIT 100;
$$;
