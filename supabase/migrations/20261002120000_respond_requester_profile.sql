-- Expose requester profile fields to responders (pending response uses my_responses; browse uses browse_request).

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
  created_at timestamp with time zone
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
    CASE
      WHEN r.status = 'posted' AND r.expires_at <= now() THEN 'expired'::public.request_status
      ELSE r.status
    END,
    rr.decline_reason,
    r.requester_id,
    p.display_name,
    p.avatar_path,
    p.bio,
    p.rating_average,
    p.rating_count,
    public.requester_completion_percent(r.requester_id),
    rr.created_at
  FROM me
  JOIN public.request_responses rr ON rr.responder_id = me.user_id
  JOIN public.requests r ON r.id = rr.request_id
  JOIN public.profiles p ON p.id = r.requester_id
  ORDER BY rr.created_at DESC;
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
  requester_completion_percent integer
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
    public.requester_completion_percent(r.requester_id)
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

GRANT ALL ON FUNCTION public.my_responses() TO anon;
GRANT ALL ON FUNCTION public.my_responses() TO authenticated;
GRANT ALL ON FUNCTION public.my_responses() TO service_role;

GRANT ALL ON FUNCTION public.browse_request(uuid, double precision, double precision) TO anon;
GRANT ALL ON FUNCTION public.browse_request(uuid, double precision, double precision) TO authenticated;
GRANT ALL ON FUNCTION public.browse_request(uuid, double precision, double precision) TO service_role;
