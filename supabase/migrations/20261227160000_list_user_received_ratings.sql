-- Public paginated reviews for profile sheets and future public profile surfaces.

CREATE OR REPLACE FUNCTION public.list_user_received_ratings(
  p_user_id uuid,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 20);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_user_id) THEN
    RAISE EXCEPTION 'profile not found' USING errcode = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    rating.id,
    rating.request_id,
    rating.project_assignment_id,
    a.project_id,
    rating.stars,
    rating.comment,
    rating.created_at,
    rating.rater_id,
    prof.display_name,
    prof.avatar_path
  FROM public.ratings AS rating
  JOIN public.profiles AS prof ON prof.id = rating.rater_id
  LEFT JOIN public.project_assignments AS a ON a.id = rating.project_assignment_id
  WHERE rating.ratee_id = p_user_id
  ORDER BY rating.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.list_user_received_ratings(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_user_received_ratings(uuid, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.list_user_received_ratings(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_received_ratings(uuid, integer, integer) TO service_role;