CREATE OR REPLACE FUNCTION public.provider_completion_percent(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN total = 0 THEN NULL
    ELSE round(100.0 * completed / total)::integer
  END
  FROM (
    SELECT
      count(*) FILTER (WHERE status = 'completed') AS completed,
      count(*) FILTER (WHERE status IN ('completed', 'no_show')) AS total
    FROM public.requests
    WHERE selected_user_id = p_user_id
  ) stats;
$$;

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
    rr.message,
    rr.quoted_amount,
    rr.distance_m,
    rr.status,
    rr.created_at,
    rr.expires_at,
    (ua.request_id IS NULL) AS responder_available
  FROM public.requests r
  JOIN public.request_responses rr ON rr.request_id = r.id
  JOIN public.profiles p ON p.id = rr.responder_id
  LEFT JOIN public.user_attendance ua ON ua.user_id = rr.responder_id
  WHERE r.id = p_request_id
    AND r.requester_id = public.assert_authenticated()
    AND rr.status IN ('pending', 'accepted')
  ORDER BY rr.created_at ASC;
$$;
