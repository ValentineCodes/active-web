-- List received ratings for requests and project assignments.

DROP FUNCTION IF EXISTS public.my_received_ratings();

CREATE FUNCTION public.my_received_ratings()
RETURNS TABLE(
  rating_id uuid,
  request_id uuid,
  project_assignment_id uuid,
  project_id uuid,
  stars smallint,
  comment text,
  created_at timestamp with time zone,
  rater_id uuid,
  rater_display_name text,
  rater_avatar_path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH me AS (SELECT public.assert_onboarded() AS user_id)
  SELECT
    rating.id,
    rating.request_id,
    rating.project_assignment_id,
    a.project_id,
    rating.stars,
    rating.comment,
    rating.created_at,
    rating.rater_id,
    p.display_name,
    p.avatar_path
  FROM me
  JOIN public.ratings rating ON rating.ratee_id = me.user_id
  JOIN public.profiles p ON p.id = rating.rater_id
  LEFT JOIN public.project_assignments a ON a.id = rating.project_assignment_id
  ORDER BY rating.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.my_received_ratings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_received_ratings() TO service_role;