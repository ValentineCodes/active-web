-- Self-attested NIN capture for withdrawal identity gate and marketplace verified badge.
-- Plaintext NIN is never stored; only encrypted payload + HMAC fingerprint (service_role writes).

CREATE TABLE public.user_nin_secrets (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL,
  key_version text NOT NULL DEFAULT 'v1',
  nin_fingerprint text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_nin_secrets_key_version_check CHECK (char_length(btrim(key_version)) > 0),
  CONSTRAINT user_nin_secrets_nonce_len CHECK (octet_length(nonce) = 12),
  CONSTRAINT user_nin_secrets_ciphertext_nonempty CHECK (octet_length(ciphertext) > 0),
  CONSTRAINT user_nin_secrets_fingerprint_format CHECK (nin_fingerprint ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX user_nin_secrets_fingerprint_unique_idx
  ON public.user_nin_secrets (nin_fingerprint);

COMMENT ON TABLE public.user_nin_secrets IS
  'Encrypted NIN payloads. Readable only via service_role; admins use separate audited reveal RPC (future).';

ALTER TABLE public.user_nin_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_nin_secrets FROM PUBLIC;
REVOKE ALL ON TABLE public.user_nin_secrets FROM anon;
REVOKE ALL ON TABLE public.user_nin_secrets FROM authenticated;
GRANT ALL ON TABLE public.user_nin_secrets TO service_role;

CREATE OR REPLACE FUNCTION public.user_marketplace_identity_verified(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_identity_verifications v
    WHERE v.user_id = p_user_id
      AND v.status = 'verified'
  );
$$;

REVOKE ALL ON FUNCTION public.user_marketplace_identity_verified(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_marketplace_identity_verified(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_marketplace_identity_verified(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.user_has_provider_identity_verification(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.user_marketplace_identity_verified(p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.get_my_identity_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_verified boolean;
  v_submitted boolean;
BEGIN
  v_verified := public.user_marketplace_identity_verified(v_user_id);

  SELECT EXISTS (
    SELECT 1 FROM public.user_nin_secrets s WHERE s.user_id = v_user_id
  )
  INTO v_submitted;

  RETURN jsonb_build_object(
    'nin_submitted', coalesce(v_submitted, false) OR v_verified,
    'identity_verified', coalesce(v_verified, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_identity_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_identity_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_identity_status() TO service_role;

CREATE OR REPLACE FUNCTION public.submit_user_nin_encrypted(
  p_user_id uuid,
  p_ciphertext bytea,
  p_nonce bytea,
  p_key_version text,
  p_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_existing public.user_nin_secrets%rowtype;
  v_fp text := lower(btrim(p_fingerprint));
  v_key text := btrim(p_key_version);
  v_now timestamptz := now();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING errcode = '22023';
  END IF;

  IF p_ciphertext IS NULL OR octet_length(p_ciphertext) = 0 THEN
    RAISE EXCEPTION 'ciphertext is required' USING errcode = '22023';
  END IF;

  IF p_nonce IS NULL OR octet_length(p_nonce) <> 12 THEN
    RAISE EXCEPTION 'invalid encryption nonce' USING errcode = '22023';
  END IF;

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'key_version is required' USING errcode = '22023';
  END IF;

  IF v_fp IS NULL OR v_fp = '' OR v_fp !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid nin fingerprint' USING errcode = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT * INTO v_existing
  FROM public.user_nin_secrets s
  WHERE s.user_id = p_user_id;

  IF FOUND THEN
    IF v_existing.nin_fingerprint = v_fp THEN
      RETURN jsonb_build_object(
        'status', 'already_submitted',
        'identity_verified', public.user_marketplace_identity_verified(p_user_id)
      );
    END IF;

    RAISE EXCEPTION 'nin already submitted for this account' USING errcode = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_nin_secrets s
    WHERE s.nin_fingerprint = v_fp
  ) THEN
    RAISE EXCEPTION 'nin is already linked to another account' USING errcode = '55000';
  END IF;

  INSERT INTO public.user_nin_secrets (
    user_id,
    ciphertext,
    nonce,
    key_version,
    nin_fingerprint,
    submitted_at
  )
  VALUES (
    p_user_id,
    p_ciphertext,
    p_nonce,
    v_key,
    v_fp,
    v_now
  );

  INSERT INTO public.user_identity_verifications (
    user_id,
    status,
    provider,
    provider_reference,
    verified_at,
    created_at,
    updated_at
  )
  VALUES (
    p_user_id,
    'verified',
    'nin_self_attested',
    NULL,
    v_now,
    v_now,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    status = 'verified',
    provider = 'nin_self_attested',
    provider_reference = NULL,
    verified_at = coalesce(public.user_identity_verifications.verified_at, excluded.verified_at),
    updated_at = excluded.updated_at;

  RETURN jsonb_build_object(
    'status', 'submitted',
    'identity_verified', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text) TO service_role;

-- Public profile surfaces: expose identity_verified boolean only (never NIN).

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
    rr.created_at ASC;
$$;

DROP FUNCTION IF EXISTS public.list_my_request_conversations();

CREATE OR REPLACE FUNCTION public.list_my_request_conversations()
RETURNS TABLE(
  conversation_id uuid,
  request_id uuid,
  request_title text,
  request_status public.request_status,
  messaging_enabled boolean,
  counterparty_id uuid,
  counterparty_display_name text,
  counterparty_avatar_path text,
  counterparty_avatar_captured_in_app boolean,
  counterparty_identity_verified boolean,
  latest_message_body text,
  latest_message_at timestamptz,
  latest_message_sender_id uuid,
  unread_count integer,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH me AS (SELECT public.assert_authenticated() AS user_id)
  SELECT
    c.id,
    c.request_id,
    r.title,
    r.status,
    public.conversation_sending_allowed_for_participant(c.id, me.user_id),
    CASE
      WHEN me.user_id = c.requester_id THEN c.selected_user_id
      ELSE c.requester_id
    END,
    p.display_name,
    p.avatar_path,
    p.avatar_captured_in_app,
    public.user_marketplace_identity_verified(p.id),
    latest.body,
    latest.created_at,
    latest.sender_id,
    coalesce(unread.count, 0),
    c.updated_at
  FROM me
  JOIN public.request_conversations c
    ON me.user_id IN (c.requester_id, c.selected_user_id)
   AND public.request_conversation_is_accessible(c.id, me.user_id)
  JOIN public.requests r ON r.id = c.request_id
  JOIN public.profiles p
    ON p.id = CASE
      WHEN me.user_id = c.requester_id THEN c.selected_user_id
      ELSE c.requester_id
    END
  LEFT JOIN LATERAL (
    SELECT m.body, m.created_at, m.sender_id
    FROM public.request_messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) latest ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS count
    FROM public.request_messages m
    WHERE m.conversation_id = c.id
      AND m.message_type = 'text'::public.conversation_message_type
      AND m.sender_id <> me.user_id
      AND m.read_at IS NULL
  ) unread ON true
  ORDER BY c.updated_at DESC;
$$;

DROP FUNCTION IF EXISTS public.resolve_request_conversation_for_viewer(uuid);

CREATE OR REPLACE FUNCTION public.resolve_request_conversation_for_viewer(p_lookup_id uuid)
RETURNS TABLE(
  conversation_id uuid,
  request_id uuid,
  requester_id uuid,
  selected_user_id uuid,
  response_id uuid,
  request_status public.request_status,
  messaging_enabled boolean,
  is_pre_handshake boolean,
  request_title text,
  request_description text,
  counterparty_id uuid,
  counterparty_display_name text,
  counterparty_avatar_path text,
  counterparty_identity_verified boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_conversation_id uuid;
  v_counterparty_id uuid;
BEGIN
  IF public.request_conversation_is_accessible(p_lookup_id, v_user_id) THEN
    v_conversation_id := p_lookup_id;
  ELSE
    SELECT c.id
      INTO v_conversation_id
    FROM public.request_conversations c
    JOIN public.requests r ON r.id = c.request_id
    JOIN public.handshakes h
      ON h.request_id = c.request_id
     AND h.requester_id = c.requester_id
     AND h.selected_user_id = c.selected_user_id
    WHERE c.request_id = p_lookup_id
      AND v_user_id IN (c.requester_id, c.selected_user_id)
      AND r.selected_user_id = c.selected_user_id;
  END IF;

  IF v_conversation_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    CASE
      WHEN v_user_id = c.requester_id THEN c.selected_user_id
      ELSE c.requester_id
    END
  INTO v_counterparty_id
  FROM public.request_conversations c
  WHERE c.id = v_conversation_id;

  RETURN QUERY
  SELECT
    c.id,
    c.request_id,
    c.requester_id,
    c.selected_user_id,
    c.response_id,
    r.status,
    public.conversation_sending_allowed_for_participant(c.id, v_user_id),
    NOT EXISTS (
      SELECT 1
      FROM public.handshakes h
      WHERE h.request_id = c.request_id
    ),
    r.title,
    r.description,
    v_counterparty_id,
    p.display_name,
    p.avatar_path,
    public.user_marketplace_identity_verified(v_counterparty_id),
    c.created_at,
    c.updated_at
  FROM public.request_conversations c
  JOIN public.requests r ON r.id = c.request_id
  JOIN public.profiles p ON p.id = v_counterparty_id
  WHERE c.id = v_conversation_id;
END;
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

DROP FUNCTION IF EXISTS public.browse_nearby_requests(double precision, double precision);

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
  requester_rating_count integer,
  requester_identity_verified boolean
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
    p.rating_count,
    public.user_marketplace_identity_verified(p.id)
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

DROP FUNCTION IF EXISTS public.browse_open_requests();

CREATE OR REPLACE FUNCTION public.browse_open_requests()
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
  requester_rating_count integer,
  requester_identity_verified boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH viewer AS (
    SELECT public.assert_onboarded() AS user_id
  )
  SELECT
    r.id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    NULL::integer,
    p.display_name,
    p.avatar_path,
    p.rating_average,
    p.rating_count,
    public.user_marketplace_identity_verified(p.id)
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
  ORDER BY r.created_at DESC;
$$;

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
  requester_identity_verified boolean,
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
    public.user_marketplace_identity_verified(p.id),
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
  posted_at timestamp with time zone
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
    r.created_at
  FROM me
  JOIN public.request_responses rr ON rr.responder_id = me.user_id
  JOIN public.requests r ON r.id = rr.request_id
  JOIN public.profiles p ON p.id = r.requester_id
  ORDER BY rr.created_at DESC;
$$;
