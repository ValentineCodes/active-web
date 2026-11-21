-- Assignment detail: contributor visibility, worker profile, payout eligibility flags.

CREATE OR REPLACE FUNCTION public.assert_may_view_project_assignment(
  p_assignment_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.project_assignments a
    WHERE a.id = p_assignment_id
      AND (
        a.creator_id = p_user_id
        OR a.worker_id = p_user_id
        OR EXISTS (
          SELECT 1
          FROM public.project_contributions pc
          WHERE pc.project_id = a.project_id
            AND pc.contributor_id = p_user_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_assignment_release_milestone_id(p_assignment_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT m.id
  FROM public.project_assignment_milestones m
  WHERE m.assignment_id = p_assignment_id
    AND m.status = 'submitted'::public.milestone_status
    AND NOT EXISTS (
      SELECT 1
      FROM public.project_assignment_milestones earlier
      WHERE earlier.assignment_id = p_assignment_id
        AND earlier.position < m.position
        AND earlier.status <> 'approved_paid'::public.milestone_status
    )
  ORDER BY m.position ASC
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.get_project_assignment(uuid);

CREATE OR REPLACE FUNCTION public.get_project_assignment(p_assignment_id uuid)
RETURNS TABLE(
  assignment_id uuid,
  project_id uuid,
  creator_id uuid,
  worker_id uuid,
  worker_username text,
  worker_display_name text,
  worker_avatar_path text,
  worker_rating_average numeric,
  worker_rating_count integer,
  status public.project_assignment_status,
  payment_structure public.payment_structure,
  compensation_total_kobo bigint,
  due_at timestamptz,
  accepted_at timestamptz,
  commenced_at timestamptz,
  title text,
  description text,
  deliverables text,
  terms_version integer,
  reservation_secured boolean,
  reservation_amount_kobo bigint,
  reservation_released_kobo bigint,
  has_open_dispute boolean,
  viewer_is_creator boolean,
  viewer_is_worker boolean,
  viewer_is_contributor boolean,
  viewer_may_report boolean,
  creator_may_release_payment boolean,
  release_payment_milestone_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_release_milestone uuid;
BEGIN
  PERFORM public.assert_may_view_project_assignment(p_assignment_id, v_user_id);

  SELECT public.project_assignment_release_milestone_id(p_assignment_id) INTO v_release_milestone;

  RETURN QUERY
  SELECT
    a.id,
    a.project_id,
    a.creator_id,
    a.worker_id,
    wprof.username::text,
    wprof.display_name,
    wprof.avatar_path,
    wprof.rating_average,
    wprof.rating_count,
    a.status,
    a.payment_structure,
    a.compensation_total_kobo,
    a.due_at,
    a.accepted_at,
    a.commenced_at,
    t.title,
    t.description,
    t.deliverables,
    t.version,
    (r.assignment_id IS NOT NULL),
    coalesce(r.amount_kobo, 0::bigint),
    coalesce(r.released_kobo, 0::bigint),
    public.project_assignment_has_open_dispute(a.id),
    a.creator_id = v_user_id,
    a.worker_id = v_user_id,
    (
      a.creator_id <> v_user_id
      AND a.worker_id <> v_user_id
      AND EXISTS (
        SELECT 1
        FROM public.project_contributions pc
        WHERE pc.project_id = a.project_id
          AND pc.contributor_id = v_user_id
      )
    ),
    (
      v_user_id IN (a.creator_id, a.worker_id)
      AND a.status IN (
        'commenced'::public.project_assignment_status,
        'completed'::public.project_assignment_status
      )
    ),
  CASE
    WHEN a.creator_id <> v_user_id THEN false
    WHEN public.project_assignment_has_open_dispute(a.id) THEN false
    WHEN a.status <> 'commenced'::public.project_assignment_status THEN false
    WHEN a.payment_structure = 'single'::public.payment_structure THEN
      EXISTS (
        SELECT 1
        FROM public.project_assignment_submissions s
        WHERE s.assignment_id = a.id
          AND s.milestone_id IS NULL
      )
      AND coalesce(r.released_kobo, 0::bigint) < a.compensation_total_kobo
    WHEN a.payment_structure = 'milestone'::public.payment_structure THEN
      v_release_milestone IS NOT NULL
    ELSE false
  END,
  CASE
    WHEN a.creator_id <> v_user_id THEN NULL
    WHEN a.payment_structure = 'milestone'::public.payment_structure THEN v_release_milestone
    ELSE NULL
  END
  FROM public.project_assignments a
  JOIN public.project_assignment_terms t ON t.id = a.active_terms_id
  JOIN public.profiles wprof ON wprof.id = a.worker_id
  LEFT JOIN public.project_assignment_reservations r ON r.assignment_id = a.id
  WHERE a.id = p_assignment_id;
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
  PERFORM public.assert_may_view_project_assignment(p_assignment_id, v_user_id);

  RETURN QUERY
  SELECT m.id, m.position AS milestone_position, m.title, m.amount_kobo, m.status, m.due_at
  FROM public.project_assignment_milestones m
  WHERE m.assignment_id = p_assignment_id
  ORDER BY m.position ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_may_view_project_assignment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_assignment_release_milestone_id(uuid) TO authenticated;