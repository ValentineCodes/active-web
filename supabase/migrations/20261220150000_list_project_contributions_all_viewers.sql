-- Anyone who may view a project sees every contribution (name + amount surfaced in clients).

CREATE OR REPLACE FUNCTION public.list_project_contributions(
  p_project_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  contribution_id uuid,
  contributor_id uuid,
  contributor_display_name text,
  contributor_username text,
  amount_kobo bigint,
  reserved_kobo bigint,
  contributed_at timestamptz,
  viewer_is_creator boolean,
  viewer_is_self boolean
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
  v_is_creator boolean;
BEGIN
  PERFORM public.assert_may_view_project(p_project_id, v_user_id);

  SELECT p.creator_id = v_user_id INTO v_is_creator
  FROM public.projects p
  WHERE p.id = p_project_id;

  RETURN QUERY
  SELECT
    pc.id,
    pc.contributor_id,
    prof.display_name,
    prof.username::text,
    pc.amount_kobo,
    pc.reserved_kobo,
    pc.created_at,
    v_is_creator,
    pc.contributor_id = v_user_id
  FROM public.project_contributions pc
  JOIN public.profiles prof ON prof.id = pc.contributor_id
  WHERE pc.project_id = p_project_id
  ORDER BY pc.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;