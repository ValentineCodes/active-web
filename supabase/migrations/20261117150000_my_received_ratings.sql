-- List ratings received by the signed-in user, with reviewer display fields for profile reputation.

CREATE OR REPLACE FUNCTION public.my_received_ratings()
RETURNS TABLE(
  rating_id uuid,
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
    rating.stars,
    rating.comment,
    rating.created_at,
    rating.rater_id,
    p.display_name,
    p.avatar_path
  FROM me
  JOIN public.ratings rating ON rating.ratee_id = me.user_id
  JOIN public.profiles p ON p.id = rating.rater_id
  ORDER BY rating.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.my_received_ratings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_received_ratings() TO service_role;