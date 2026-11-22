-- Bidirectional ratings for completed project assignments (same profile rollup as requests).

ALTER TABLE public.ratings
  ALTER COLUMN request_id DROP NOT NULL;

ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS project_assignment_id uuid
  REFERENCES public.project_assignments (id) ON DELETE CASCADE;

ALTER TABLE public.ratings
  DROP CONSTRAINT IF EXISTS ratings_request_id_rater_id_key;

ALTER TABLE public.ratings
  ADD CONSTRAINT ratings_request_or_assignment_check CHECK (
    (
      request_id IS NOT NULL
      AND project_assignment_id IS NULL
    )
    OR (
      request_id IS NULL
      AND project_assignment_id IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS ratings_request_id_rater_id_uidx
  ON public.ratings (request_id, rater_id)
  WHERE request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ratings_project_assignment_rater_uidx
  ON public.ratings (project_assignment_id, rater_id)
  WHERE project_assignment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.rate_project_assignment(
  p_assignment_id uuid,
  p_stars smallint,
  p_comment text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_assignment public.project_assignments%rowtype;
  v_ratee_id uuid;
BEGIN
  IF p_stars IS NULL OR p_stars < 1 OR p_stars > 5 THEN
    RAISE EXCEPTION 'stars must be between 1 and 5' USING errcode = '22023';
  END IF;

  IF p_comment IS NOT NULL AND char_length(btrim(p_comment)) > 500 THEN
    RAISE EXCEPTION 'comment must be 500 characters or fewer' USING errcode = '22023';
  END IF;

  SELECT * INTO v_assignment
  FROM public.project_assignments a
  WHERE a.id = p_assignment_id
    AND a.status = 'completed'::public.project_assignment_status
    AND v_user_id IN (a.creator_id, a.worker_id);

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'only a completed assignment can be rated' USING errcode = '55000';
  END IF;

  IF v_user_id = v_assignment.creator_id THEN
    v_ratee_id := v_assignment.worker_id;
  ELSE
    v_ratee_id := v_assignment.creator_id;
  END IF;

  INSERT INTO public.ratings (
    request_id,
    project_assignment_id,
    rater_id,
    ratee_id,
    stars,
    comment
  )
  VALUES (
    NULL,
    p_assignment_id,
    v_user_id,
    v_ratee_id,
    p_stars,
    nullif(btrim(p_comment), '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rate_project_assignment(uuid, smallint, text) TO authenticated;

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
  completed_at timestamptz,
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
  worker_may_submit boolean,
  viewer_has_rated boolean,
  viewer_may_rate boolean,
  counterparty_id uuid,
  counterparty_display_name text,
  counterparty_avatar_path text,
  received_rating_stars smallint,
  received_rating_comment text
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
    a.completed_at,
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
    END,
    EXISTS (
      SELECT 1
      FROM public.ratings rt
      WHERE rt.project_assignment_id = a.id
        AND rt.rater_id = v_user_id
    ),
    (
      a.status = 'completed'::public.project_assignment_status
      AND v_user_id IN (a.creator_id, a.worker_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.ratings rt
        WHERE rt.project_assignment_id = a.id
          AND rt.rater_id = v_user_id
      )
    ),
    CASE
      WHEN v_user_id = a.creator_id THEN a.worker_id
      WHEN v_user_id = a.worker_id THEN a.creator_id
      ELSE NULL::uuid
    END,
    CASE
      WHEN v_user_id = a.creator_id THEN wprof.display_name
      WHEN v_user_id = a.worker_id THEN cprof.display_name
      ELSE NULL::text
    END,
    CASE
      WHEN v_user_id = a.creator_id THEN wprof.avatar_path
      WHEN v_user_id = a.worker_id THEN cprof.avatar_path
      ELSE NULL::text
    END,
    received.stars,
    received.comment
  FROM public.project_assignments a
  JOIN public.project_assignment_terms t ON t.id = a.active_terms_id
  JOIN public.profiles wprof ON wprof.id = a.worker_id
  JOIN public.profiles cprof ON cprof.id = a.creator_id
  LEFT JOIN public.project_assignment_reservations r ON r.assignment_id = a.id
  LEFT JOIN public.ratings received
    ON received.project_assignment_id = a.id
   AND received.ratee_id = v_user_id
   AND received.rater_id = CASE
      WHEN v_user_id = a.creator_id THEN a.worker_id
      WHEN v_user_id = a.worker_id THEN a.creator_id
      ELSE NULL::uuid
    END
  WHERE a.id = p_assignment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_assignment(uuid) TO authenticated;