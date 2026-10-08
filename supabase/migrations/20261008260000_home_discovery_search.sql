-- Global open-request discovery (distance-sorted), searchable home feed, and view-vs-respond split.

CREATE TABLE public.request_search_queries (
  normalized_query text PRIMARY KEY,
  search_count bigint NOT NULL DEFAULT 1,
  last_searched_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT request_search_queries_normalized_check CHECK (
    char_length(btrim(normalized_query)) >= 2 AND char_length(normalized_query) <= 120
  )
);

ALTER TABLE public.request_search_queries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.request_search_queries FROM PUBLIC;
GRANT SELECT ON TABLE public.request_search_queries TO authenticated;
GRANT ALL ON TABLE public.request_search_queries TO service_role;

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
   AND r.payment_status = 'locked'::public.payment_status
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
   AND r.payment_status = 'locked'::public.payment_status
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

GRANT ALL ON FUNCTION public.browse_request(uuid, double precision, double precision) TO anon;
GRANT ALL ON FUNCTION public.browse_request(uuid, double precision, double precision) TO authenticated;
GRANT ALL ON FUNCTION public.browse_request(uuid, double precision, double precision) TO service_role;

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
   AND r.payment_status = 'locked'::public.payment_status
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

GRANT ALL ON FUNCTION public.search_requests(text, double precision, double precision) TO authenticated;
GRANT ALL ON FUNCTION public.search_requests(text, double precision, double precision) TO service_role;

CREATE OR REPLACE FUNCTION public.record_request_search(p_query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_normalized text;
BEGIN
  PERFORM public.assert_onboarded();

  v_normalized := lower(btrim(coalesce(p_query, '')));
  IF char_length(v_normalized) < 2 OR char_length(v_normalized) > 120 THEN
    RETURN;
  END IF;

  INSERT INTO public.request_search_queries AS rsq (normalized_query, search_count, last_searched_at)
  VALUES (v_normalized, 1, now())
  ON CONFLICT (normalized_query) DO UPDATE
  SET
    search_count = rsq.search_count + 1,
    last_searched_at = now();
END;
$$;

GRANT ALL ON FUNCTION public.record_request_search(text) TO authenticated;
GRANT ALL ON FUNCTION public.record_request_search(text) TO service_role;

CREATE OR REPLACE FUNCTION public.search_request_queries(
  p_prefix text DEFAULT '',
  p_limit integer DEFAULT 20
)
RETURNS TABLE(normalized_query text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT rsq.normalized_query
  FROM public.request_search_queries rsq
  WHERE btrim(coalesce(p_prefix, '')) = ''
    OR rsq.normalized_query LIKE lower(btrim(p_prefix)) || '%'
  ORDER BY rsq.search_count DESC, rsq.last_searched_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
$$;

GRANT ALL ON FUNCTION public.search_request_queries(text, integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_request_queries(text, integer) TO service_role;
