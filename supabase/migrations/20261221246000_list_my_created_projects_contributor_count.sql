-- Profile project cards: distinct contributor count per created project.

DROP FUNCTION IF EXISTS public.list_my_created_projects(integer, integer);

CREATE OR REPLACE FUNCTION public.list_my_created_projects(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  project_id uuid,
  title text,
  status public.project_status,
  funding_status public.project_funding_status,
  funding_deadline_at timestamptz,
  budget_total_kobo bigint,
  contributed_total_kobo bigint,
  contributor_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_limit integer := LEAST(GREATEST(coalesce(p_limit, 20), 1), 50);
  v_offset integer := GREATEST(coalesce(p_offset, 0), 0);
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.title,
    p.status,
    p.funding_status,
    p.funding_deadline_at,
    p.budget_total_kobo,
    pool.contributed_total_kobo,
    coalesce(contrib.contributor_count, 0)
  FROM public.projects p
  JOIN public.project_funding_pools pool ON pool.project_id = p.id
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT pc.contributor_id)::int AS contributor_count
    FROM public.project_contributions pc
    WHERE pc.project_id = p.id
  ) contrib ON true
  WHERE p.creator_id = v_user_id
  ORDER BY p.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_created_projects(integer, integer) TO authenticated;