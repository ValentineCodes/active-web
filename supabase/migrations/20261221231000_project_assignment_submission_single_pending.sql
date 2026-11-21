-- Single-payment assignments: one open submission at a time until approval or revision.

CREATE OR REPLACE FUNCTION public.project_assignment_submission_assert_may_submit(
  p_assignment_id uuid,
  p_user_id uuid,
  p_milestone_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_assignment public.project_assignments%rowtype;
  v_milestone public.project_assignment_milestones%rowtype;
  v_prior_unpaid integer;
BEGIN
  SELECT * INTO v_assignment
  FROM public.project_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF v_assignment.id IS NULL OR v_assignment.worker_id <> p_user_id THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  IF v_assignment.status <> 'commenced'::public.project_assignment_status THEN
    RAISE EXCEPTION 'assignment is not in progress' USING errcode = '55000';
  END IF;

  IF public.project_assignment_has_open_dispute(p_assignment_id) THEN
    RAISE EXCEPTION 'assignment has an open dispute' USING errcode = '55000';
  END IF;

  IF p_milestone_id IS NOT NULL THEN
    SELECT * INTO v_milestone
    FROM public.project_assignment_milestones m
    WHERE m.id = p_milestone_id AND m.assignment_id = p_assignment_id
    FOR UPDATE;

    IF v_milestone.id IS NULL THEN
      RAISE EXCEPTION 'milestone not found' USING errcode = 'P0002';
    END IF;

    IF v_milestone.position > 1 THEN
      SELECT count(*)::int INTO v_prior_unpaid
      FROM public.project_assignment_milestones m
      WHERE m.assignment_id = p_assignment_id
        AND m.position < v_milestone.position
        AND m.status <> 'approved_paid'::public.milestone_status;

      IF v_prior_unpaid > 0 THEN
        RAISE EXCEPTION 'earlier milestones must be approved before submitting this one' USING errcode = '55000';
      END IF;
    END IF;

    IF v_milestone.status NOT IN (
      'in_progress'::public.milestone_status,
      'revision_requested'::public.milestone_status
    ) THEN
      RAISE EXCEPTION 'milestone cannot be submitted in its current state' USING errcode = '55000';
    END IF;
  ELSIF v_assignment.payment_structure = 'milestone'::public.payment_structure THEN
    RAISE EXCEPTION 'milestone id is required for milestone assignments' USING errcode = '22023';
  ELSIF EXISTS (
    SELECT 1
    FROM public.project_assignment_submissions s
    WHERE s.assignment_id = p_assignment_id
      AND s.milestone_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.project_assignment_approvals a
        WHERE a.submission_id = s.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.project_assignment_revisions r
        WHERE r.submission_id = s.id
      )
  ) THEN
    RAISE EXCEPTION 'a submission is already awaiting review' USING errcode = '55000';
  END IF;

END;
$$;