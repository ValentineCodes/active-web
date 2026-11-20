-- Consumer read RPCs for collaborative Projects (list/detail/activity). Extends get_project access for Workers.

CREATE OR REPLACE FUNCTION public.assert_may_view_project(p_project_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_project public.projects%rowtype;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
  END IF;

  IF v_project.creator_id = p_user_id THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_contributions pc
    WHERE pc.project_id = p_project_id AND pc.contributor_id = p_user_id
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_assignments a
    WHERE a.project_id = p_project_id AND a.worker_id = p_user_id
  ) THEN
    RETURN;
  END IF;

  IF v_project.status = 'live'::public.project_status
     AND (
       v_project.funding_visibility = 'public'::public.project_funding_visibility
       OR EXISTS (
         SELECT 1
         FROM public.project_contributor_invitations inv
         WHERE inv.project_id = p_project_id AND inv.invitee_id = p_user_id
       )
     ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_project(p_project_id uuid)
RETURNS TABLE(
  project_id uuid,
  creator_id uuid,
  title text,
  description text,
  attachment_path text,
  project_visibility public.project_visibility,
  funding_visibility public.project_funding_visibility,
  budget_total_kobo bigint,
  min_funding_target_kobo bigint,
  min_contribution_kobo bigint,
  funding_deadline_at timestamptz,
  funding_timezone text,
  funding_opened_at timestamptz,
  status public.project_status,
  funding_status public.project_funding_status,
  min_target_reached_at timestamptz,
  fully_funded_at timestamptz,
  funding_unsuccessful_at timestamptz,
  contributed_total_kobo bigint,
  reserved_total_kobo bigint,
  committed_compensation_kobo bigint,
  viewer_is_creator boolean,
  tag_slugs text[]
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  PERFORM public.assert_may_view_project(p_project_id, v_user_id);
  PERFORM public.evaluate_project_funding_status(p_project_id);

  RETURN QUERY
  SELECT
    p.id,
    p.creator_id,
    p.title,
    p.description,
    p.attachment_path,
    p.project_visibility,
    p.funding_visibility,
    p.budget_total_kobo,
    p.min_funding_target_kobo,
    p.min_contribution_kobo,
    p.funding_deadline_at,
    p.funding_timezone,
    p.funding_opened_at,
    p.status,
    p.funding_status,
    p.min_target_reached_at,
    p.fully_funded_at,
    p.funding_unsuccessful_at,
    pool.contributed_total_kobo,
    pool.reserved_total_kobo,
    pool.committed_compensation_kobo,
    p.creator_id = v_user_id,
    coalesce(
      (
        SELECT array_agg(t.slug ORDER BY t.slug)
        FROM public.project_tags pt
        JOIN public.tags t ON t.id = pt.tag_id
        WHERE pt.project_id = p.id
      ),
      '{}'::text[]
    )
  FROM public.projects p
  JOIN public.project_funding_pools pool ON pool.project_id = p.id
  WHERE p.id = p_project_id;
END;
$$;

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
  contributed_total_kobo bigint
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
    pool.contributed_total_kobo
  FROM public.projects p
  JOIN public.project_funding_pools pool ON pool.project_id = p.id
  WHERE p.creator_id = v_user_id
  ORDER BY p.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_project_assignments(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  assignment_id uuid,
  project_id uuid,
  project_title text,
  status public.project_assignment_status,
  compensation_total_kobo bigint,
  due_at timestamptz,
  reservation_secured boolean
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
    a.id,
    a.project_id,
    p.title,
    a.status,
    a.compensation_total_kobo,
    a.due_at,
    EXISTS (
      SELECT 1
      FROM public.project_assignment_reservations r
      WHERE r.assignment_id = a.id
        AND r.amount_kobo = a.compensation_total_kobo
    )
  FROM public.project_assignments a
  JOIN public.projects p ON p.id = a.project_id
  WHERE a.worker_id = v_user_id
  ORDER BY a.updated_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_project_assignments(
  p_project_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  assignment_id uuid,
  worker_id uuid,
  worker_display_name text,
  status public.project_assignment_status,
  title text,
  compensation_total_kobo bigint,
  due_at timestamptz,
  reservation_secured boolean,
  viewer_is_creator boolean
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
    a.id,
    a.worker_id,
    prof.display_name,
    a.status,
    t.title,
    a.compensation_total_kobo,
    a.due_at,
    EXISTS (
      SELECT 1
      FROM public.project_assignment_reservations r
      WHERE r.assignment_id = a.id
        AND r.amount_kobo = a.compensation_total_kobo
    ),
    v_is_creator
  FROM public.project_assignments a
  JOIN public.project_assignment_terms t ON t.id = a.active_terms_id
  JOIN public.profiles prof ON prof.id = a.worker_id
  WHERE a.project_id = p_project_id
    AND (v_is_creator OR a.worker_id = v_user_id)
  ORDER BY a.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

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
    AND (
      v_is_creator
      OR pc.contributor_id = v_user_id
    )
  ORDER BY pc.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

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
  SELECT *
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
  ) events(event_at, event_type, summary)
  WHERE event_at IS NOT NULL
  ORDER BY event_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_project_assignment_milestones(p_assignment_id uuid)
RETURNS TABLE(
  milestone_id uuid,
  milestone_position integer,
  title text,
  amount_kobo bigint,
  status public.milestone_status,
  due_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.project_assignments a
    WHERE a.id = p_assignment_id
      AND (a.creator_id = v_user_id OR a.worker_id = v_user_id)
  ) THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  RETURN QUERY
  SELECT m.id, m.position AS milestone_position, m.title, m.amount_kobo, m.status, m.due_at
  FROM public.project_assignment_milestones m
  WHERE m.assignment_id = p_assignment_id
  ORDER BY m.position ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_project_assignment_submissions(
  p_assignment_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  submission_id uuid,
  milestone_id uuid,
  note text,
  submitted_at timestamptz
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.project_assignments a
    WHERE a.id = p_assignment_id
      AND (a.creator_id = v_user_id OR a.worker_id = v_user_id)
  ) THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  RETURN QUERY
  SELECT s.id, s.milestone_id, s.note, s.created_at
  FROM public.project_assignment_submissions s
  WHERE s.assignment_id = p_assignment_id
  ORDER BY s.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_may_view_project(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_created_projects(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_project_assignments(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_project_assignments(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_project_contributions(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_project_activity(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_project_assignment_milestones(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_project_assignment_submissions(uuid, integer, integer) TO authenticated;