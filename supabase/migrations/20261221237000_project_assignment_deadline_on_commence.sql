-- Binding project assignment delivery deadline starts at commencement (same model as request engagements).

CREATE OR REPLACE FUNCTION public.start_project_assignment(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_assignment public.project_assignments%rowtype;
  v_terms public.project_assignment_terms%rowtype;
  v_commenced_at timestamptz := now();
  v_due_at timestamptz;
BEGIN
  SELECT * INTO v_assignment
  FROM public.project_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF v_assignment.id IS NULL OR v_assignment.worker_id <> v_user_id THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  IF v_assignment.status = 'commenced'::public.project_assignment_status THEN
    RETURN;
  END IF;

  IF v_assignment.status <> 'accepted'::public.project_assignment_status THEN
    RAISE EXCEPTION 'assignment must be accepted before commencement' USING errcode = '55000';
  END IF;

  PERFORM public.project_assignment_commencement_allowed(v_assignment.project_id, p_assignment_id);

  SELECT * INTO v_terms
  FROM public.project_assignment_terms t
  WHERE t.id = v_assignment.active_terms_id;

  IF v_terms.proposed_delivery_duration_seconds IS NOT NULL
     AND v_terms.proposed_delivery_duration_seconds > 0 THEN
    v_due_at := v_commenced_at
      + make_interval(secs => v_terms.proposed_delivery_duration_seconds::double precision);
    PERFORM public.assert_delivery_deadline_within_max_from_start(v_due_at, v_commenced_at);
  ELSIF v_terms.due_at IS NOT NULL AND v_assignment.accepted_at IS NOT NULL THEN
    v_due_at := public.compute_shifted_delivery_deadline(
      v_terms.due_at,
      v_assignment.accepted_at,
      v_commenced_at
    );
    PERFORM public.assert_delivery_deadline_within_max_from_start(v_due_at, v_commenced_at);
  ELSE
    v_due_at := v_assignment.due_at;
  END IF;

  UPDATE public.project_assignments
  SET status = 'commenced'::public.project_assignment_status,
      commenced_at = v_commenced_at,
      due_at = v_due_at,
      updated_at = now()
  WHERE id = p_assignment_id;

  IF v_assignment.payment_structure = 'milestone'::public.payment_structure THEN
    UPDATE public.project_assignment_milestones m
    SET status = 'in_progress'::public.milestone_status
    WHERE m.assignment_id = p_assignment_id
      AND m.position = 1
      AND m.status = 'pending'::public.milestone_status;
  END IF;
END;
$$;

-- Repair in-flight and completed rows that still carry respond/accept-time deadlines.
UPDATE public.project_assignments a
SET due_at = a.commenced_at
  + make_interval(secs => t.proposed_delivery_duration_seconds::double precision)
FROM public.project_assignment_terms t
WHERE t.id = a.active_terms_id
  AND a.commenced_at IS NOT NULL
  AND a.status IN (
    'commenced'::public.project_assignment_status,
    'completed'::public.project_assignment_status
  )
  AND t.proposed_delivery_duration_seconds IS NOT NULL
  AND t.proposed_delivery_duration_seconds > 0;

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
  proposed_delivery_duration_value integer,
  proposed_delivery_duration_unit public.delivery_duration_unit,
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
  release_payment_milestone_id uuid,
  worker_may_submit boolean
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
    t.proposed_delivery_duration_value,
    t.proposed_delivery_duration_unit,
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
    END,
    CASE
      WHEN a.worker_id <> v_user_id THEN false
      WHEN a.status <> 'commenced'::public.project_assignment_status THEN false
      WHEN public.project_assignment_has_open_dispute(a.id) THEN false
      WHEN a.payment_structure = 'single'::public.payment_structure THEN
        NOT EXISTS (
          SELECT 1
          FROM public.project_assignment_submissions s
          WHERE s.assignment_id = a.id
            AND s.milestone_id IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public.project_assignment_approvals ap
              WHERE ap.submission_id = s.id
            )
            AND NOT EXISTS (
              SELECT 1
              FROM public.project_assignment_revisions rv
              WHERE rv.submission_id = s.id
            )
        )
      WHEN a.payment_structure = 'milestone'::public.payment_structure THEN
        EXISTS (
          SELECT 1
          FROM public.project_assignment_milestones m
          WHERE m.assignment_id = a.id
            AND m.status IN (
              'in_progress'::public.milestone_status,
              'revision_requested'::public.milestone_status
            )
        )
      ELSE false
    END
  FROM public.project_assignments a
  JOIN public.project_assignment_terms t ON t.id = a.active_terms_id
  JOIN public.profiles wprof ON wprof.id = a.worker_id
  LEFT JOIN public.project_assignment_reservations r ON r.assignment_id = a.id
  WHERE a.id = p_assignment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_assignment(uuid) TO authenticated;