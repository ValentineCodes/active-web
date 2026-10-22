-- Align search results with browse RPCs: expose requester verified badge flag (boolean only).

DROP FUNCTION IF EXISTS public.search_requests(text, double precision, double precision);

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
    p.rating_count,
    public.user_marketplace_identity_verified(p.id)
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

REVOKE ALL ON FUNCTION public.search_requests(text, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_requests(text, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_requests(text, double precision, double precision) TO service_role;
