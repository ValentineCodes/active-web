-- Browse RPCs must stay read-only (PostgREST STABLE / SQLSTATE 25006).
-- Discovery coordinates are recorded via record_discovery_coordinates from the client.

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
  JOIN public.profiles p ON p.id = r.requester_id
  ORDER BY extensions.ST_Distance(r.location, viewer.location) ASC, r.created_at DESC
  LIMIT 40;
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
  tag_slugs text[]
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
    public.request_tag_slugs(r.id)
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

CREATE OR REPLACE FUNCTION public.record_discovery_coordinates(
  p_latitude double precision,
  p_longitude double precision
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_location extensions.geography := public.assert_coordinates(p_latitude, p_longitude);
BEGIN
  UPDATE public.profiles
  SET discovery_location = v_location,
      discovery_location_updated_at = now()
  WHERE id = v_user_id;
END;
$$;
