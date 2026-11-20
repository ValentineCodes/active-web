-- Home / open browse: public live projects plus the viewer's own projects (including drafts).

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
  creator_id uuid,
  creator_display_name text,
  creator_avatar_path text,
  viewer_is_creator boolean,
  posted_at timestamptz
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
    pr.id,
    pr.title,
    pr.description,
    pr.attachment_path,
    pr.funding_status,
    pr.budget_total_kobo,
    pr.min_funding_target_kobo,
    pool.contributed_total_kobo,
    pr.creator_id,
    p.display_name,
    p.avatar_path,
    pr.creator_id = viewer.user_id,
    pr.created_at
  FROM viewer
  CROSS JOIN public.projects pr
  JOIN public.project_funding_pools pool ON pool.project_id = pr.id
  JOIN public.profiles p ON p.id = pr.creator_id
  WHERE (
    pr.creator_id = viewer.user_id
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

GRANT EXECUTE ON FUNCTION public.browse_open_projects(integer, integer) TO authenticated;