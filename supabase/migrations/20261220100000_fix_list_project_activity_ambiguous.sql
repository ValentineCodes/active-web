-- list_project_activity: RETURN QUERY column names shadowed subquery "event_at" (SQLSTATE 42702).

CREATE OR REPLACE FUNCTION public.list_project_activity(
  p_project_id uuid,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  event_at timestamptz,
  event_type text,
  summary text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_limit integer := LEAST(GREATEST(coalesce(p_limit, 30), 1), 100);
  v_offset integer := GREATEST(coalesce(p_offset, 0), 0);
BEGIN
  PERFORM public.assert_may_view_project(p_project_id, v_user_id);

  RETURN QUERY
  SELECT e.event_at, e.event_type, e.summary
  FROM (
    SELECT p.funding_opened_at, 'funding_opened'::text, 'Funding opened'::text
    FROM public.projects p
    WHERE p.id = p_project_id AND p.funding_opened_at IS NOT NULL

    UNION ALL

    SELECT p.min_target_reached_at, 'min_target_reached', 'Minimum funding target reached'
    FROM public.projects p
    WHERE p.id = p_project_id AND p.min_target_reached_at IS NOT NULL

    UNION ALL

    SELECT p.fully_funded_at, 'fully_funded', 'Project fully funded'
    FROM public.projects p
    WHERE p.id = p_project_id AND p.fully_funded_at IS NOT NULL

    UNION ALL

    SELECT pc.created_at, 'contribution',
      'Contribution received'
    FROM public.project_contributions pc
    WHERE pc.project_id = p_project_id
      AND EXISTS (
        SELECT 1 FROM public.projects pr
        WHERE pr.id = p_project_id AND pr.creator_id = v_user_id
      )

    UNION ALL

    SELECT a.created_at, 'assignment_created',
      'Assignment created'
    FROM public.project_assignments a
    JOIN public.projects pr ON pr.id = a.project_id
    WHERE a.project_id = p_project_id
      AND (pr.creator_id = v_user_id OR a.worker_id = v_user_id)
  ) e(event_at, event_type, summary)
  WHERE e.event_at IS NOT NULL
  ORDER BY e.event_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;