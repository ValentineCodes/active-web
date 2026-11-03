-- Expose requester profile fields on browse/search rows for home feed person sheet.

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
        'search_requests'
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
  LIMIT COALESCE(p_limit, 100)
  OFFSET GREATEST(p_offset, 0);
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
GRANT EXECUTE ON FUNCTION public.search_requests(text, double precision, double precision, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_requests(text, double precision, double precision, integer, integer) TO service_role;
