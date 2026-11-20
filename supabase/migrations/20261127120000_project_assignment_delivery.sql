-- Project assignment deliverables, milestone workflow, payouts, and dispute holds (Phase 8).

ALTER TABLE public.project_assignment_submissions
  ADD COLUMN IF NOT EXISTS evidence_paths text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.project_assignment_approvals
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.project_assignment_payments (id) ON DELETE SET NULL;

CREATE TABLE public.project_assignment_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.project_assignments (id) ON DELETE CASCADE,
  reported_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  kind public.service_problem_kind NOT NULL DEFAULT 'completion_issue'::public.service_problem_kind,
  status text NOT NULL DEFAULT 'open',
  description text NOT NULL DEFAULT '',
  evidence_paths text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT project_assignment_disputes_status_check CHECK (
    status = ANY (ARRAY['open'::text, 'resolved'::text])
  )
);

CREATE UNIQUE INDEX project_assignment_disputes_one_open_idx
  ON public.project_assignment_disputes (assignment_id)
  WHERE status = 'open'::text;

COMMENT ON TABLE public.project_assignment_disputes IS
  'Assignment-scoped disputes. Open rows block payout release (UD-04/05 closure math not implemented).';

ALTER TABLE public.project_assignment_disputes OWNER TO postgres;
ALTER TABLE public.project_assignment_disputes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_assignment_disputes FROM PUBLIC;
GRANT SELECT ON TABLE public.project_assignment_disputes TO service_role;

CREATE OR REPLACE FUNCTION public.snapshot_project_assignment_milestones(
  p_assignment_id uuid,
  p_terms_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_item record;
  v_charge record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.project_assignment_milestones m WHERE m.assignment_id = p_assignment_id
  ) THEN
    RETURN;
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.parse_milestone_items_json(
      (
        SELECT t.milestones_json
        FROM public.project_assignment_terms t
        WHERE t.id = p_terms_id
      )
    )
    ORDER BY milestone_position
  LOOP
    SELECT * INTO v_charge FROM public.compute_request_charge(v_item.amount_major);

    INSERT INTO public.project_assignment_milestones (
      assignment_id,
      terms_id,
      position,
      title,
      description,
      amount_major,
      total_kobo,
      provider_kobo,
      fee_kobo,
      status
    )
    VALUES (
      p_assignment_id,
      p_terms_id,
      v_item.milestone_position,
      v_item.title,
      coalesce(v_item.description, ''),
      v_item.amount_major,
      public.ngn_major_to_kobo(v_charge.total),
      public.ngn_major_to_kobo(v_charge.provider_amount),
      public.ngn_major_to_kobo(v_charge.service_fee),
      CASE
        WHEN v_item.milestone_position = 1 THEN 'in_progress'::public.milestone_status
        ELSE 'pending'::public.milestone_status
      END
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_assignment_has_open_dispute(p_assignment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_assignment_disputes d
    WHERE d.assignment_id = p_assignment_id
      AND d.status = 'open'::text
  );
$$;

CREATE OR REPLACE FUNCTION public.assert_project_assignment_payout_allowed(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF public.project_assignment_has_open_dispute(p_assignment_id) THEN
    RAISE EXCEPTION 'assignment has an open dispute' USING errcode = '55000';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_project_assignment_problem(
  p_assignment_id uuid,
  p_kind public.service_problem_kind DEFAULT 'completion_issue'::public.service_problem_kind,
  p_description text DEFAULT '',
  p_evidence_paths text[] DEFAULT '{}'::text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_assignment public.project_assignments%rowtype;
  v_dispute_id uuid;
  v_description text := coalesce(p_description, '');
  v_evidence text[] := coalesce(p_evidence_paths, '{}');
BEGIN
  PERFORM public.assert_dispute_evidence_paths(v_user_id, v_evidence);

  SELECT * INTO v_assignment
  FROM public.project_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  IF v_user_id NOT IN (v_assignment.creator_id, v_assignment.worker_id) THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  IF v_assignment.status NOT IN (
    'commenced'::public.project_assignment_status,
    'completed'::public.project_assignment_status
  ) THEN
    RAISE EXCEPTION 'problems can only be reported on active assignments' USING errcode = '55000';
  END IF;

  IF public.project_assignment_has_open_dispute(p_assignment_id) THEN
    RETURN (
      SELECT d.id
      FROM public.project_assignment_disputes d
      WHERE d.assignment_id = p_assignment_id AND d.status = 'open'::text
    );
  END IF;

  INSERT INTO public.project_assignment_disputes (
    assignment_id,
    reported_by,
    kind,
    description,
    evidence_paths
  )
  VALUES (
    p_assignment_id,
    v_user_id,
    p_kind,
    btrim(v_description),
    v_evidence
  )
  RETURNING id INTO v_dispute_id;

  RETURN v_dispute_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_assignment_release_payment(
  p_assignment_id uuid,
  p_milestone_id uuid,
  p_idempotency_key text,
  p_provider_kobo bigint,
  p_fee_kobo bigint,
  p_total_kobo bigint,
  p_approved_by uuid,
  p_submission_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_assignment public.project_assignments%rowtype;
  v_reservation public.project_assignment_reservations%rowtype;
  v_reference text;
  v_payment_id uuid;
  v_new_released bigint;
BEGIN
  PERFORM public.assert_project_assignment_payout_allowed(p_assignment_id);

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  v_reference := 'project_assignment_payout:' || p_idempotency_key;

  IF EXISTS (
    SELECT 1 FROM public.project_assignment_payments pay WHERE pay.wallet_reference = v_reference
  ) THEN
    RETURN (
      SELECT pay.id FROM public.project_assignment_payments pay WHERE pay.wallet_reference = v_reference
    );
  END IF;

  SELECT * INTO v_assignment
  FROM public.project_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  SELECT * INTO v_reservation
  FROM public.project_assignment_reservations r
  WHERE r.assignment_id = p_assignment_id
  FOR UPDATE;

  IF v_reservation.assignment_id IS NULL THEN
    RAISE EXCEPTION 'assignment compensation is not secured' USING errcode = '55000';
  END IF;

  IF v_reservation.released_kobo + p_total_kobo > v_reservation.amount_kobo THEN
    RAISE EXCEPTION 'payout would exceed secured assignment compensation' USING errcode = '55000';
  END IF;

  PERFORM public.wallet_credit_kobo(
    v_reference || ':payout',
    v_assignment.worker_id,
    p_provider_kobo,
    'project_assignment_payout'::public.wallet_transaction_type,
    'Project assignment payment',
    NULL,
    NULL,
    jsonb_build_object(
      'project_id', v_assignment.project_id,
      'assignment_id', p_assignment_id,
      'milestone_id', p_milestone_id
    )
  );

  UPDATE public.wallet_transactions wt
  SET project_id = v_assignment.project_id
  WHERE wt.reference = v_reference || ':payout';

  IF p_fee_kobo > 0 THEN
    PERFORM public.wallet_apply_entry(
      v_reference || ':fee',
      v_assignment.creator_id,
      NULL,
      'service_fee'::public.wallet_transaction_type,
      0,
      0,
      'Project assignment service fee',
      jsonb_build_object(
        'project_id', v_assignment.project_id,
        'assignment_id', p_assignment_id,
        'milestone_id', p_milestone_id
      ),
      NULL,
      p_fee_kobo
    );
  END IF;

  INSERT INTO public.project_assignment_payments (
    assignment_id,
    milestone_id,
    provider_kobo,
    fee_kobo,
    total_kobo,
    wallet_reference
  )
  VALUES (
    p_assignment_id,
    p_milestone_id,
    p_provider_kobo,
    p_fee_kobo,
    p_total_kobo,
    v_reference
  )
  RETURNING id INTO v_payment_id;

  IF p_submission_id IS NOT NULL THEN
    INSERT INTO public.project_assignment_approvals (
      submission_id,
      milestone_id,
      approved_by,
      payment_id
    )
    VALUES (
      p_submission_id,
      p_milestone_id,
      p_approved_by,
      v_payment_id
    );
  END IF;

  v_new_released := v_reservation.released_kobo + p_total_kobo;

  UPDATE public.project_assignment_reservations
  SET released_kobo = v_new_released
  WHERE assignment_id = p_assignment_id;

  IF p_milestone_id IS NOT NULL THEN
    UPDATE public.project_assignment_milestones
    SET status = 'approved_paid'::public.milestone_status,
        approved_at = now(),
        approved_by = p_approved_by,
        payout_reference = v_reference
    WHERE id = p_milestone_id;
  END IF;

  IF v_new_released = v_reservation.amount_kobo THEN
    UPDATE public.project_assignments
    SET status = 'completed'::public.project_assignment_status,
        completed_at = now(),
        updated_at = now()
    WHERE id = p_assignment_id;
  END IF;

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_project_assignment_deliverable(
  p_assignment_id uuid,
  p_note text DEFAULT NULL,
  p_evidence_paths text[] DEFAULT '{}'::text[],
  p_milestone_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_assignment public.project_assignments%rowtype;
  v_milestone public.project_assignment_milestones%rowtype;
  v_submission_id uuid;
  v_prior_unpaid integer;
BEGIN
  SELECT * INTO v_assignment
  FROM public.project_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF v_assignment.id IS NULL OR v_assignment.worker_id <> v_user_id THEN
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
  END IF;

  INSERT INTO public.project_assignment_submissions (
    assignment_id,
    milestone_id,
    submitted_by,
    note,
    evidence_paths
  )
  VALUES (
    p_assignment_id,
    p_milestone_id,
    v_user_id,
    nullif(btrim(p_note), ''),
    coalesce(p_evidence_paths, '{}'::text[])
  )
  RETURNING id INTO v_submission_id;

  IF p_milestone_id IS NOT NULL THEN
    UPDATE public.project_assignment_milestones
    SET status = 'submitted'::public.milestone_status,
        submitted_at = now(),
        submitted_by = v_user_id
    WHERE id = p_milestone_id;
  END IF;

  RETURN v_submission_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_project_assignment_revision(
  p_submission_id uuid,
  p_note text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_submission public.project_assignment_submissions%rowtype;
  v_assignment public.project_assignments%rowtype;
  v_revision_id uuid;
BEGIN
  SELECT * INTO v_submission
  FROM public.project_assignment_submissions s
  WHERE s.id = p_submission_id
  FOR UPDATE;

  IF v_submission.id IS NULL THEN
    RAISE EXCEPTION 'submission not found' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_assignment
  FROM public.project_assignments
  WHERE id = v_submission.assignment_id
  FOR UPDATE;

  IF v_assignment.creator_id <> v_user_id THEN
    RAISE EXCEPTION 'submission not found' USING errcode = 'P0002';
  END IF;

  IF v_submission.milestone_id IS NOT NULL THEN
    UPDATE public.project_assignment_milestones m
    SET status = 'revision_requested'::public.milestone_status,
        revision_requested_at = now(),
        revision_requested_by = v_user_id
    WHERE m.id = v_submission.milestone_id
      AND m.status = 'submitted'::public.milestone_status;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'only a submitted milestone deliverable can be sent back' USING errcode = '55000';
    END IF;
  END IF;

  INSERT INTO public.project_assignment_revisions (
    submission_id,
    requested_by,
    note
  )
  VALUES (
    p_submission_id,
    v_user_id,
    coalesce(btrim(p_note), '')
  )
  RETURNING id INTO v_revision_id;

  RETURN v_revision_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_project_assignment_single(
  p_assignment_id uuid,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_assignment public.project_assignments%rowtype;
  v_charge record;
  v_submission_id uuid;
BEGIN
  SELECT a.* INTO v_assignment
  FROM public.project_assignments a
  JOIN public.projects p ON p.id = a.project_id
  WHERE a.id = p_assignment_id AND p.creator_id = v_user_id
  FOR UPDATE OF a;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  IF v_assignment.payment_structure <> 'single'::public.payment_structure THEN
    RAISE EXCEPTION 'this assignment uses milestone payments' USING errcode = '55000';
  END IF;

  SELECT s.id INTO v_submission_id
  FROM public.project_assignment_submissions s
  WHERE s.assignment_id = p_assignment_id
    AND s.milestone_id IS NULL
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_submission_id IS NULL THEN
    RAISE EXCEPTION 'no deliverable submission to approve' USING errcode = '55000';
  END IF;

  SELECT * INTO v_charge FROM public.compute_request_charge(
    public.kobo_to_ngn_major(v_assignment.compensation_total_kobo)
  );

  RETURN public.project_assignment_release_payment(
    p_assignment_id,
    NULL,
    p_idempotency_key,
    public.ngn_major_to_kobo(v_charge.provider_amount),
    public.ngn_major_to_kobo(v_charge.service_fee),
    v_assignment.compensation_total_kobo,
    v_user_id,
    v_submission_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_project_assignment_milestone(
  p_milestone_id uuid,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_milestone public.project_assignment_milestones%rowtype;
  v_assignment public.project_assignments%rowtype;
  v_existing_payment uuid;
  v_next_id uuid;
BEGIN
  SELECT * INTO v_milestone
  FROM public.project_assignment_milestones m
  WHERE m.id = p_milestone_id
  FOR UPDATE;

  IF v_milestone.id IS NULL THEN
    RAISE EXCEPTION 'milestone not found' USING errcode = 'P0002';
  END IF;

  IF v_milestone.status = 'approved_paid'::public.milestone_status THEN
    SELECT pay.id INTO v_existing_payment
    FROM public.project_assignment_payments pay
    WHERE pay.milestone_id = p_milestone_id
    ORDER BY pay.created_at DESC
    LIMIT 1;
    RETURN v_existing_payment;
  END IF;

  SELECT a.* INTO v_assignment
  FROM public.project_assignments a
  JOIN public.projects p ON p.id = a.project_id
  WHERE a.id = v_milestone.assignment_id AND p.creator_id = v_user_id
  FOR UPDATE OF a;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'milestone not found' USING errcode = 'P0002';
  END IF;

  IF v_milestone.status <> 'submitted'::public.milestone_status THEN
    RAISE EXCEPTION 'only a submitted milestone can be approved' USING errcode = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_assignment_milestones m
    WHERE m.assignment_id = v_milestone.assignment_id
      AND m.position < v_milestone.position
      AND m.status <> 'approved_paid'::public.milestone_status
  ) THEN
    RAISE EXCEPTION 'earlier milestones must be approved first' USING errcode = '55000';
  END IF;

  v_existing_payment := public.project_assignment_release_payment(
    v_milestone.assignment_id,
    p_milestone_id,
    p_idempotency_key,
    v_milestone.provider_kobo,
    v_milestone.fee_kobo,
    v_milestone.total_kobo,
    v_user_id,
    NULL
  );

  SELECT m.id INTO v_next_id
  FROM public.project_assignment_milestones m
  WHERE m.assignment_id = v_milestone.assignment_id
    AND m.position = v_milestone.position + 1
  FOR UPDATE;

  IF v_next_id IS NOT NULL THEN
    UPDATE public.project_assignment_milestones
    SET status = 'in_progress'::public.milestone_status
    WHERE id = v_next_id
      AND status = 'pending'::public.milestone_status;
  END IF;

  RETURN v_existing_payment;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_project_assignment_work(
  p_assignment_id uuid,
  p_milestone_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN public.submit_project_assignment_deliverable(
    p_assignment_id,
    p_note,
    '{}'::text[],
    p_milestone_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_and_payout_project_assignment(
  p_assignment_id uuid,
  p_milestone_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  IF p_milestone_id IS NOT NULL THEN
    RETURN public.approve_project_assignment_milestone(p_milestone_id, p_idempotency_key);
  END IF;

  RETURN public.approve_project_assignment_single(p_assignment_id, p_idempotency_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_project_assignment(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_assignment public.project_assignments%rowtype;
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

  UPDATE public.project_assignments
  SET status = 'commenced'::public.project_assignment_status,
      commenced_at = now(),
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

GRANT EXECUTE ON FUNCTION public.submit_project_assignment_deliverable(
  uuid, text, text[], uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_project_assignment_revision(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_project_assignment_single(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_project_assignment_milestone(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_project_assignment_problem(
  uuid, public.service_problem_kind, text, text[]
) TO authenticated;