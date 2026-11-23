-- Guest (anon) marketplace read layer: browse/search/profile/project detail and listing media.
-- Authenticated callers keep existing assert_onboarded() semantics via optional_onboarded_viewer_id().

CREATE OR REPLACE FUNCTION public.optional_onboarded_viewer_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public.assert_onboarded();
END;
$$;

REVOKE ALL ON FUNCTION public.optional_onboarded_viewer_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.optional_onboarded_viewer_id() TO anon;
GRANT EXECUTE ON FUNCTION public.optional_onboarded_viewer_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.optional_onboarded_viewer_id() TO service_role;

CREATE OR REPLACE FUNCTION public.assert_guest_may_view_project(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_project public.projects%rowtype;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
  END IF;

  IF v_project.status = 'live'::public.project_status
     AND v_project.funding_visibility = 'public'::public.project_funding_visibility
     AND v_project.funding_status IN (
       'open'::public.project_funding_status,
       'target_met'::public.project_funding_status,
       'fully_funded'::public.project_funding_status
     ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_guest_may_view_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_guest_may_view_project(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.assert_guest_may_view_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_guest_may_view_project(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.guest_can_read_marketplace_media(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.requests r
    WHERE r.attachment_path = p_name
      AND r.status = 'posted'::public.request_status
      AND r.expires_at > now()
      AND r.offered_amount IS NOT NULL
      AND r.offered_amount > 0
      AND r.payment_status IN (
        'not_required'::public.payment_status,
        'locked'::public.payment_status
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.projects pr
    WHERE pr.attachment_path = p_name
      AND pr.status = 'live'::public.project_status
      AND pr.funding_visibility = 'public'::public.project_funding_visibility
      AND pr.funding_status IN (
        'open'::public.project_funding_status,
        'target_met'::public.project_funding_status,
        'fully_funded'::public.project_funding_status
      )
  );
$$;

REVOKE ALL ON FUNCTION public.guest_can_read_marketplace_media(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_can_read_marketplace_media(text) TO anon;
GRANT EXECUTE ON FUNCTION public.guest_can_read_marketplace_media(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guest_can_read_marketplace_media(text) TO service_role;

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
  v_user_id uuid := auth.uid();
  v_location extensions.geography;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  v_user_id := public.assert_authenticated();
  v_location := public.assert_coordinates(p_latitude, p_longitude);

  UPDATE public.profiles
  SET discovery_location = v_location,
      discovery_location_updated_at = now()
  WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_discovery_coordinates(double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_discovery_coordinates(double precision, double precision) TO anon;
GRANT EXECUTE ON FUNCTION public.record_discovery_coordinates(double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_discovery_coordinates(double precision, double precision) TO service_role;

DO $drop$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'browse_nearby_requests',
        'browse_open_requests',
        'search_requests',
        'browse_request'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', f);
  END LOOP;
END
$drop$;

CREATE OR REPLACE FUNCTION public.browse_nearby_requests(
  p_latitude double precision,
  p_longitude double precision,
  p_limit integer DEFAULT NULL,
  p_offset integer DEFAULT 0
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
  posted_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH viewer AS (
    SELECT
      public.optional_onboarded_viewer_id() AS user_id,
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
    r.created_at
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
   AND (viewer.user_id IS NULL OR r.requester_id <> viewer.user_id)
   AND (
     viewer.user_id IS NULL
     OR NOT EXISTS (
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
   )
  JOIN public.profiles p ON p.id = r.requester_id
  ORDER BY extensions.ST_Distance(r.location, viewer.location) ASC, r.created_at DESC
  LIMIT COALESCE(p_limit, 2147483647)
  OFFSET GREATEST(p_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.browse_open_requests(
  p_limit integer DEFAULT NULL,
  p_offset integer DEFAULT 0
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
  posted_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH viewer AS (
    SELECT public.optional_onboarded_viewer_id() AS user_id
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
    r.requester_id,
    p.display_name,
    p.avatar_path,
    p.bio,
    p.rating_average,
    p.rating_count,
    public.requester_completion_percent(r.requester_id),
    public.user_marketplace_identity_verified(p.id),
    r.attachment_path,
    r.created_at
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
   AND (viewer.user_id IS NULL OR r.requester_id <> viewer.user_id)
   AND (
     viewer.user_id IS NULL
     OR NOT EXISTS (
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
   )
  JOIN public.profiles p ON p.id = r.requester_id
  ORDER BY r.created_at DESC
  LIMIT COALESCE(p_limit, 2147483647)
  OFFSET GREATEST(p_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.search_requests(
  p_query text,
  p_latitude double precision,
  p_longitude double precision,
  p_limit integer DEFAULT NULL,
  p_offset integer DEFAULT 0
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
  posted_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH viewer AS (
    SELECT
      public.optional_onboarded_viewer_id() AS user_id,
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
    r.requester_id,
    p.display_name,
    p.avatar_path,
    p.bio,
    p.rating_average,
    p.rating_count,
    public.requester_completion_percent(r.requester_id),
    public.user_marketplace_identity_verified(p.id),
    r.attachment_path,
    r.created_at
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
   AND (viewer.user_id IS NULL OR r.requester_id <> viewer.user_id)
   AND (
     viewer.user_id IS NULL
     OR NOT EXISTS (
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
  LIMIT COALESCE(p_limit, 100)
  OFFSET GREATEST(p_offset, 0);
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
      public.optional_onboarded_viewer_id() AS user_id,
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
    CASE
      WHEN viewer.user_id IS NULL THEN false
      ELSE extensions.ST_DWithin(r.location, viewer.location, public.discovery_radius_m())
    END
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
   AND (viewer.user_id IS NULL OR r.requester_id <> viewer.user_id)
   AND (
     viewer.user_id IS NULL
     OR NOT EXISTS (
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
   )
  JOIN public.profiles p ON p.id = r.requester_id;
$$;

REVOKE ALL ON FUNCTION public.browse_nearby_requests(double precision, double precision, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.browse_nearby_requests(double precision, double precision, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.browse_nearby_requests(double precision, double precision, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.browse_nearby_requests(double precision, double precision, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.browse_open_requests(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.browse_open_requests(integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.browse_open_requests(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.browse_open_requests(integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.search_requests(text, double precision, double precision, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_requests(text, double precision, double precision, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_requests(text, double precision, double precision, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_requests(text, double precision, double precision, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.browse_request(uuid, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.browse_request(uuid, double precision, double precision) TO anon;
GRANT EXECUTE ON FUNCTION public.browse_request(uuid, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.browse_request(uuid, double precision, double precision) TO service_role;

DROP FUNCTION IF EXISTS public.browse_open_projects(integer, integer);

CREATE OR REPLACE FUNCTION public.browse_open_projects(
  p_limit integer DEFAULT NULL,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  project_id uuid,
  title text,
  description text,
  attachment_path text,
  funding_status public.project_funding_status,
  budget_total_kobo bigint,
  min_funding_target_kobo bigint,
  contributed_total_kobo bigint,
  funding_deadline_at timestamptz,
  creator_id uuid,
  creator_display_name text,
  creator_avatar_path text,
  viewer_is_creator boolean,
  location_label text,
  posted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH viewer AS (
    SELECT public.optional_onboarded_viewer_id() AS user_id
  )
  SELECT
    pr.id,
    pr.title,
    pr.description,
    pr.attachment_path,
    pr.funding_status,
    pr.budget_total_kobo,
    pr.min_funding_target_kobo,
    pool.contributed_total_kobo,
    pr.funding_deadline_at,
    pr.creator_id,
    p.display_name,
    p.avatar_path,
    pr.creator_id IS NOT DISTINCT FROM viewer.user_id,
    pr.location_label,
    pr.created_at
  FROM viewer
  CROSS JOIN public.projects pr
  JOIN public.project_funding_pools pool ON pool.project_id = pr.id
  JOIN public.profiles p ON p.id = pr.creator_id
  WHERE (
    viewer.user_id IS NOT NULL
    AND pr.creator_id = viewer.user_id
    AND pr.status IN (
      'draft'::public.project_status,
      'live'::public.project_status
    )
  )
  OR (
    pr.status = 'live'::public.project_status
    AND pr.funding_visibility = 'public'::public.project_funding_visibility
    AND pr.funding_status IN (
      'open'::public.project_funding_status,
      'target_met'::public.project_funding_status,
      'fully_funded'::public.project_funding_status
    )
  )
  ORDER BY pr.created_at DESC
  LIMIT COALESCE(p_limit, 2147483647)
  OFFSET GREATEST(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.browse_open_projects(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.browse_open_projects(integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.browse_open_projects(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.browse_open_projects(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.browse_project(p_project_id uuid)
RETURNS TABLE(
  project_id uuid,
  creator_id uuid,
  creator_display_name text,
  creator_avatar_path text,
  creator_bio text,
  creator_rating_average numeric,
  creator_rating_count integer,
  creator_completion_percent integer,
  creator_identity_verified boolean,
  title text,
  description text,
  attachment_path text,
  project_visibility public.project_visibility,
  funding_visibility public.project_funding_visibility,
  budget_total_kobo bigint,
  min_funding_target_kobo bigint,
  min_contribution_kobo bigint,
  funding_deadline_at timestamptz,
  funding_timezone text,
  funding_opened_at timestamptz,
  status public.project_status,
  funding_status public.project_funding_status,
  min_target_reached_at timestamptz,
  fully_funded_at timestamptz,
  funding_unsuccessful_at timestamptz,
  contributed_total_kobo bigint,
  reserved_total_kobo bigint,
  committed_compensation_kobo bigint,
  viewer_is_creator boolean,
  viewer_is_contributor boolean,
  viewer_may_view_assignments boolean,
  viewer_may_contribute boolean,
  tag_slugs text[],
  location_label text,
  group_chat_conversation_id uuid,
  group_chat_unread_count integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'authentication required; use get_project' USING errcode = '42501';
  END IF;

  PERFORM public.assert_guest_may_view_project(p_project_id);
  PERFORM public.evaluate_project_funding_status(p_project_id);

  RETURN QUERY
  SELECT
    p.id,
    p.creator_id,
    prof.display_name,
    prof.avatar_path,
    prof.bio,
    prof.rating_average,
    prof.rating_count,
    public.requester_completion_percent(p.creator_id),
    public.user_marketplace_identity_verified(prof.id),
    p.title,
    p.description,
    p.attachment_path,
    p.project_visibility,
    p.funding_visibility,
    p.budget_total_kobo,
    p.min_funding_target_kobo,
    p.min_contribution_kobo,
    p.funding_deadline_at,
    p.funding_timezone,
    p.funding_opened_at,
    p.status,
    p.funding_status,
    p.min_target_reached_at,
    p.fully_funded_at,
    p.funding_unsuccessful_at,
    pool.contributed_total_kobo,
    pool.reserved_total_kobo,
    pool.committed_compensation_kobo,
    false,
    false,
    false,
    false,
    coalesce(
      (
        SELECT array_agg(t.slug ORDER BY t.slug)
        FROM public.project_tags pt
        JOIN public.tags t ON t.id = pt.tag_id
        WHERE pt.project_id = p.id
      ),
      '{}'::text[]
    ),
    p.location_label,
    NULL::uuid,
    0
  FROM public.projects p
  JOIN public.project_funding_pools pool ON pool.project_id = p.id
  JOIN public.profiles prof ON prof.id = p.creator_id
  WHERE p.id = p_project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.browse_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.browse_project(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.browse_project(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_public_profile(p_username text)
RETURNS TABLE(
  user_id uuid,
  username text,
  display_name text,
  bio text,
  avatar_path text,
  rating_average numeric,
  rating_count integer,
  jobs_completed integer,
  requests_completed integer,
  identity_verified boolean,
  crown_tier text,
  points_main integer,
  shield_remaining integer,
  crown_public boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_normalized text := lower(btrim(coalesce(p_username, '')));
  v_viewer uuid := auth.uid();
  v_row public.profiles%rowtype;
  v_rep public.user_reputation%rowtype;
BEGIN
  IF v_normalized = '' OR v_normalized !~ '^[a-z0-9_]+$' THEN
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.profiles p
  WHERE lower(p.username::text) = v_normalized;

  IF v_row.id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.ensure_user_reputation_row(v_row.id);
  SELECT * INTO v_rep FROM public.user_reputation ur WHERE ur.user_id = v_row.id;

  RETURN QUERY
  SELECT
    v_row.id,
    v_row.username::text,
    v_row.display_name,
    v_row.bio,
    v_row.avatar_path,
    v_row.rating_average,
    v_row.rating_count,
    v_row.jobs_completed,
    v_row.requests_completed,
    public.user_marketplace_identity_verified(v_row.id),
    CASE
      WHEN v_rep.crown_public OR v_row.id = v_viewer
        THEN public.crown_tier_for_points(v_rep.points_main)
      ELSE 'hidden'::text
    END,
    CASE WHEN v_rep.crown_public OR v_row.id = v_viewer THEN v_rep.points_main ELSE NULL END,
    CASE WHEN v_rep.crown_public OR v_row.id = v_viewer THEN v_rep.shield_remaining ELSE NULL END,
    v_rep.crown_public;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO service_role;

CREATE OR REPLACE FUNCTION public.search_people(
  p_query text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  user_id uuid,
  username text,
  display_name text,
  bio text,
  avatar_path text,
  rating_average numeric,
  rating_count integer,
  identity_verified boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := LEAST(GREATEST(coalesce(p_limit, 20), 1), 50);
  v_offset integer := GREATEST(coalesce(p_offset, 0), 0);
BEGIN
  IF v_q = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.username::text,
    p.display_name,
    p.bio,
    p.avatar_path,
    p.rating_average,
    p.rating_count,
    public.user_marketplace_identity_verified(p.id)
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND p.display_name IS NOT NULL
    AND (
      lower(p.username::text) LIKE '%' || v_q || '%'
      OR lower(coalesce(p.display_name, '')) LIKE '%' || v_q || '%'
      OR lower(coalesce(p.bio, '')) LIKE '%' || v_q || '%'
    )
  ORDER BY p.username
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.search_people(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_people(text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_people(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_people(text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.search_projects(
  p_query text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  project_id uuid,
  title text,
  description text,
  funding_status public.project_funding_status,
  funding_visibility public.project_funding_visibility,
  budget_total_kobo bigint,
  min_funding_target_kobo bigint,
  funding_deadline_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := LEAST(GREATEST(coalesce(p_limit, 20), 1), 50);
  v_offset integer := GREATEST(coalesce(p_offset, 0), 0);
BEGIN
  IF v_q = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.title,
    pr.description,
    pr.funding_status,
    pr.funding_visibility,
    pr.budget_total_kobo,
    pr.min_funding_target_kobo,
    pr.funding_deadline_at
  FROM public.projects pr
  WHERE pr.status = 'live'::public.project_status
    AND pr.funding_visibility = 'public'::public.project_funding_visibility
    AND pr.funding_status IN (
      'open'::public.project_funding_status,
      'target_met'::public.project_funding_status,
      'fully_funded'::public.project_funding_status
    )
    AND (
      lower(pr.title) LIKE '%' || v_q || '%'
      OR lower(coalesce(pr.description, '')) LIKE '%' || v_q || '%'
    )
  ORDER BY pr.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.search_projects(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_projects(text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_projects(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_projects(text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.search_discover(
  p_category public.search_discover_category,
  p_query text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_q text := btrim(coalesce(p_query, ''));
  v_slice integer := LEAST(GREATEST(coalesce(p_limit, 20), 1), 50);
  v_requests jsonb := '[]'::jsonb;
  v_people jsonb := '[]'::jsonb;
  v_projects jsonb := '[]'::jsonb;
BEGIN
  IF p_category = 'people'::public.search_discover_category THEN
    IF v_q = '' THEN
      RETURN jsonb_build_object('people', v_people);
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_people
    FROM public.search_people(v_q, v_slice, p_offset) s;
    RETURN jsonb_build_object('people', v_people);
  END IF;

  IF p_category = 'projects'::public.search_discover_category THEN
    IF v_q = '' THEN
      RETURN jsonb_build_object('projects', v_projects);
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_projects
    FROM public.search_projects(v_q, v_slice, p_offset) s;
    RETURN jsonb_build_object('projects', v_projects);
  END IF;

  IF p_category = 'requests'::public.search_discover_category THEN
    IF v_q = '' OR p_latitude IS NULL OR p_longitude IS NULL THEN
      RETURN jsonb_build_object('requests', v_requests);
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_requests
    FROM public.search_requests(v_q, p_latitude, p_longitude, v_slice, p_offset) s;
    RETURN jsonb_build_object('requests', v_requests);
  END IF;

  IF v_q <> '' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_people
    FROM public.search_people(v_q, 5, 0) s;
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_projects
    FROM public.search_projects(v_q, 5, 0) s;
    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
      SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_requests
      FROM public.search_requests(v_q, p_latitude, p_longitude, 5, 0) s;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'requests', v_requests,
    'people', v_people,
    'projects', v_projects,
    'ranking', 'deferred_ud_11'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.search_discover(
  public.search_discover_category, text, double precision, double precision, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_discover(
  public.search_discover_category, text, double precision, double precision, integer, integer
) TO anon;
GRANT EXECUTE ON FUNCTION public.search_discover(
  public.search_discover_category, text, double precision, double precision, integer, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_discover(
  public.search_discover_category, text, double precision, double precision, integer, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.avatar_is_published(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.avatar_is_published(text) TO anon;
GRANT EXECUTE ON FUNCTION public.avatar_is_published(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.avatar_is_published(text) TO service_role;

DROP POLICY IF EXISTS "anon read published avatars" ON storage.objects;
CREATE POLICY "anon read published avatars" ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'avatars'::text
    AND public.avatar_is_published(name)
  );

DROP POLICY IF EXISTS "anon read marketplace listing media" ON storage.objects;
CREATE POLICY "anon read marketplace listing media" ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'request-media'::text
    AND public.guest_can_read_marketplace_media(name)
  );