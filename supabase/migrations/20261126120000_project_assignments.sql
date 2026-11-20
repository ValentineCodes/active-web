-- Project assignments, terms, reservations, and independent Worker commencement (Phase 7).

ALTER TYPE public.wallet_transaction_type ADD VALUE IF NOT EXISTS 'project_assignment_payout';

CREATE TYPE public.project_assignment_status AS ENUM (
  'offered',
  'terms_negotiation',
  'accepted',
  'commenced',
  'completed',
  'cancelled'
);

CREATE TYPE public.project_assignment_terms_status AS ENUM (
  'proposed',
  'agreed'
);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS early_commencement_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.projects.early_commencement_enabled IS
  'When false, Workers may not commence until the full Project budget is funded (UD-20 interim guard).';

CREATE TABLE public.project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status public.project_assignment_status NOT NULL DEFAULT 'offered'::public.project_assignment_status,
  active_terms_id uuid,
  payment_structure public.payment_structure NOT NULL DEFAULT 'single'::public.payment_structure,
  compensation_total_kobo bigint NOT NULL,
  due_at timestamptz NOT NULL,
  accepted_at timestamptz,
  commenced_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_assignments_worker_not_creator CHECK (worker_id <> creator_id),
  CONSTRAINT project_assignments_compensation_positive CHECK (compensation_total_kobo > 0)
);

CREATE INDEX project_assignments_project_idx ON public.project_assignments (project_id, created_at DESC);
CREATE INDEX project_assignments_worker_idx ON public.project_assignments (worker_id, created_at DESC);

CREATE TABLE public.project_assignment_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.project_assignments (id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  deliverables text NOT NULL DEFAULT '',
  compensation_total_kobo bigint NOT NULL,
  payment_structure public.payment_structure NOT NULL,
  due_at timestamptz NOT NULL,
  milestones_json jsonb,
  status public.project_assignment_terms_status NOT NULL DEFAULT 'proposed'::public.project_assignment_terms_status,
  proposed_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  worker_agreed_at timestamptz,
  creator_agreed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_assignment_terms_version_positive CHECK (version >= 1),
  CONSTRAINT project_assignment_terms_title_length CHECK (
    char_length(btrim(title)) BETWEEN 1 AND 120
  ),
  CONSTRAINT project_assignment_terms_compensation_positive CHECK (compensation_total_kobo > 0),
  CONSTRAINT project_assignment_terms_assignment_version_key UNIQUE (assignment_id, version)
);

ALTER TABLE public.project_assignments
  ADD CONSTRAINT project_assignments_active_terms_id_fkey
  FOREIGN KEY (active_terms_id) REFERENCES public.project_assignment_terms (id) ON DELETE SET NULL;

CREATE TABLE public.project_assignment_reservations (
  assignment_id uuid PRIMARY KEY REFERENCES public.project_assignments (id) ON DELETE CASCADE,
  pool_reservation_id uuid NOT NULL REFERENCES public.project_pool_reservations (id) ON DELETE RESTRICT,
  amount_kobo bigint NOT NULL,
  released_kobo bigint NOT NULL DEFAULT 0,
  secured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_assignment_reservations_amount_positive CHECK (amount_kobo > 0),
  CONSTRAINT project_assignment_reservations_released_check CHECK (
    released_kobo >= 0 AND released_kobo <= amount_kobo
  ),
  CONSTRAINT project_assignment_reservations_pool_reservation_key UNIQUE (pool_reservation_id)
);

CREATE TABLE public.project_assignment_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.project_assignments (id) ON DELETE CASCADE,
  terms_id uuid NOT NULL REFERENCES public.project_assignment_terms (id) ON DELETE RESTRICT,
  position integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount_major numeric(12, 2) NOT NULL,
  total_kobo bigint NOT NULL,
  provider_kobo bigint NOT NULL,
  fee_kobo bigint NOT NULL,
  status public.milestone_status NOT NULL DEFAULT 'pending'::public.milestone_status,
  submitted_at timestamptz,
  submitted_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  revision_requested_at timestamptz,
  revision_requested_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  payout_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_assignment_milestones_position_check CHECK (position >= 1 AND position <= 5),
  CONSTRAINT project_assignment_milestones_kobo_check CHECK (
    total_kobo > 0 AND total_kobo = provider_kobo + fee_kobo
  ),
  CONSTRAINT project_assignment_milestones_assignment_position_key UNIQUE (assignment_id, position),
  CONSTRAINT project_assignment_milestones_payout_reference_key UNIQUE (payout_reference)
);

CREATE TABLE public.project_assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.project_assignments (id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.project_assignment_milestones (id) ON DELETE SET NULL,
  submitted_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.project_assignment_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.project_assignment_submissions (id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.project_assignment_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.project_assignment_submissions (id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.project_assignment_milestones (id) ON DELETE SET NULL,
  approved_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.project_assignment_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.project_assignments (id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.project_assignment_milestones (id) ON DELETE SET NULL,
  provider_kobo bigint NOT NULL,
  fee_kobo bigint NOT NULL,
  total_kobo bigint NOT NULL,
  wallet_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_assignment_payments_positive CHECK (
    total_kobo > 0 AND total_kobo = provider_kobo + fee_kobo
  ),
  CONSTRAINT project_assignment_payments_wallet_reference_key UNIQUE (wallet_reference)
);

ALTER TABLE public.project_assignments OWNER TO postgres;
ALTER TABLE public.project_assignment_terms OWNER TO postgres;
ALTER TABLE public.project_assignment_reservations OWNER TO postgres;
ALTER TABLE public.project_assignment_milestones OWNER TO postgres;
ALTER TABLE public.project_assignment_submissions OWNER TO postgres;
ALTER TABLE public.project_assignment_revisions OWNER TO postgres;
ALTER TABLE public.project_assignment_approvals OWNER TO postgres;
ALTER TABLE public.project_assignment_payments OWNER TO postgres;

ALTER TABLE public.project_pool_reservations
  ADD COLUMN IF NOT EXISTS assignment_id uuid;

ALTER TABLE public.project_pool_reservations
  ADD CONSTRAINT project_pool_reservations_assignment_id_fkey
  FOREIGN KEY (assignment_id) REFERENCES public.project_assignments (id) ON DELETE SET NULL;

ALTER TABLE public.project_pool_reservations
  ADD CONSTRAINT project_pool_reservations_assignment_id_key UNIQUE (assignment_id);

CREATE OR REPLACE FUNCTION public.project_assignment_commencement_allowed(
  p_project_id uuid,
  p_assignment_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_project public.projects%rowtype;
  v_pool public.project_funding_pools%rowtype;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  SELECT * INTO v_pool FROM public.project_funding_pools WHERE project_id = p_project_id;

  IF NOT v_project.early_commencement_enabled
     AND v_pool.contributed_total_kobo < v_project.budget_total_kobo THEN
    RAISE EXCEPTION
      'full project budget must be funded before commencement while early commencement is disabled'
      USING errcode = 'P0001', hint = 'UD-20';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.project_assignment_reservations r
    JOIN public.project_assignments a ON a.id = r.assignment_id
    WHERE a.id = p_assignment_id
      AND r.amount_kobo = a.compensation_total_kobo
  ) THEN
    RAISE EXCEPTION 'assignment compensation is not fully secured' USING errcode = '55000';
  END IF;
END;
$$;

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
      fee_kobo
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
      public.ngn_major_to_kobo(v_charge.service_fee)
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_project_assignment(
  p_project_id uuid,
  p_worker_id uuid,
  p_title text,
  p_description text,
  p_deliverables text,
  p_payment_structure public.payment_structure,
  p_compensation_major numeric,
  p_due_at timestamptz,
  p_milestones jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_compensation_kobo bigint;
  v_assignment_id uuid;
  v_terms_id uuid;
BEGIN
  PERFORM public.assert_project_assignments_allowed(p_project_id);

  IF p_worker_id IS NULL OR p_worker_id = v_user_id THEN
    RAISE EXCEPTION 'invalid worker' USING errcode = '22023';
  END IF;

  IF p_due_at IS NULL OR p_due_at <= now() THEN
    RAISE EXCEPTION 'due date must be in the future' USING errcode = '22023';
  END IF;

  v_compensation_kobo := public.ngn_major_to_kobo(p_compensation_major);
  IF v_compensation_kobo <= 0 THEN
    RAISE EXCEPTION 'compensation must be positive' USING errcode = '22023';
  END IF;

  IF p_payment_structure = 'milestone'::public.payment_structure THEN
    IF p_milestones IS NULL THEN
      RAISE EXCEPTION 'milestones are required' USING errcode = '22023';
    END IF;
    IF NOT public.milestone_items_sum_matches_total(p_milestones, p_compensation_major) THEN
      RAISE EXCEPTION 'milestone amounts must sum to compensation' USING errcode = '22023';
    END IF;
  ELSIF p_milestones IS NOT NULL THEN
    RAISE EXCEPTION 'milestones are only valid for milestone payment structure' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND p.creator_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
  END IF;

  INSERT INTO public.project_assignments (
    project_id,
    creator_id,
    worker_id,
    payment_structure,
    compensation_total_kobo,
    due_at
  )
  VALUES (
    p_project_id,
    v_user_id,
    p_worker_id,
    p_payment_structure,
    v_compensation_kobo,
    p_due_at
  )
  RETURNING id INTO v_assignment_id;

  INSERT INTO public.project_assignment_terms (
    assignment_id,
    version,
    title,
    description,
    deliverables,
    compensation_total_kobo,
    payment_structure,
    due_at,
    milestones_json,
    status,
    proposed_by,
    creator_agreed_at
  )
  VALUES (
    v_assignment_id,
    1,
    btrim(p_title),
    coalesce(btrim(p_description), ''),
    coalesce(btrim(p_deliverables), ''),
    v_compensation_kobo,
    p_payment_structure,
    p_due_at,
    p_milestones,
    'proposed'::public.project_assignment_terms_status,
    v_user_id,
    now()
  )
  RETURNING id INTO v_terms_id;

  UPDATE public.project_assignments
  SET active_terms_id = v_terms_id,
      updated_at = now()
  WHERE id = v_assignment_id;

  RETURN v_assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_project_assignment(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_assignment public.project_assignments%rowtype;
  v_terms public.project_assignment_terms%rowtype;
BEGIN
  SELECT * INTO v_assignment
  FROM public.project_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  IF v_assignment.worker_id <> v_user_id THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  PERFORM public.assert_project_assignments_allowed(v_assignment.project_id);

  IF v_assignment.status NOT IN (
    'offered'::public.project_assignment_status,
    'terms_negotiation'::public.project_assignment_status
  ) THEN
    RAISE EXCEPTION 'assignment cannot be accepted in its current state' USING errcode = '55000';
  END IF;

  SELECT * INTO v_terms
  FROM public.project_assignment_terms t
  WHERE t.id = v_assignment.active_terms_id
  FOR UPDATE;

  UPDATE public.project_assignment_terms
  SET status = 'agreed'::public.project_assignment_terms_status,
      worker_agreed_at = now()
  WHERE id = v_terms.id;

  UPDATE public.project_assignments
  SET status = 'accepted'::public.project_assignment_status,
      compensation_total_kobo = v_terms.compensation_total_kobo,
      payment_structure = v_terms.payment_structure,
      due_at = v_terms.due_at,
      accepted_at = now(),
      updated_at = now()
  WHERE id = p_assignment_id;

  IF v_terms.payment_structure = 'milestone'::public.payment_structure THEN
    PERFORM public.snapshot_project_assignment_milestones(p_assignment_id, v_terms.id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.propose_project_assignment_terms(
  p_assignment_id uuid,
  p_title text,
  p_description text,
  p_deliverables text,
  p_payment_structure public.payment_structure,
  p_compensation_major numeric,
  p_due_at timestamptz,
  p_milestones jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_assignment public.project_assignments%rowtype;
  v_compensation_kobo bigint;
  v_next_version integer;
  v_terms_id uuid;
BEGIN
  v_compensation_kobo := public.ngn_major_to_kobo(p_compensation_major);

  SELECT * INTO v_assignment
  FROM public.project_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF v_assignment.id IS NULL OR v_assignment.creator_id <> v_user_id THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  IF v_assignment.status IN (
    'commenced'::public.project_assignment_status,
    'completed'::public.project_assignment_status,
    'cancelled'::public.project_assignment_status
  ) THEN
    RAISE EXCEPTION 'assignment terms cannot change' USING errcode = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.project_assignment_reservations r WHERE r.assignment_id = p_assignment_id
  ) THEN
    RAISE EXCEPTION 'release the assignment reservation before changing terms' USING errcode = '55000';
  END IF;

  IF p_payment_structure = 'milestone'::public.payment_structure THEN
    IF NOT public.milestone_items_sum_matches_total(p_milestones, p_compensation_major) THEN
      RAISE EXCEPTION 'milestone amounts must sum to compensation' USING errcode = '22023';
    END IF;
  END IF;

  SELECT coalesce(max(t.version), 0) + 1
  INTO v_next_version
  FROM public.project_assignment_terms t
  WHERE t.assignment_id = p_assignment_id;

  INSERT INTO public.project_assignment_terms (
    assignment_id,
    version,
    title,
    description,
    deliverables,
    compensation_total_kobo,
    payment_structure,
    due_at,
    milestones_json,
    status,
    proposed_by,
    creator_agreed_at
  )
  VALUES (
    p_assignment_id,
    v_next_version,
    btrim(p_title),
    coalesce(btrim(p_description), ''),
    coalesce(btrim(p_deliverables), ''),
    v_compensation_kobo,
    p_payment_structure,
    p_due_at,
    p_milestones,
    'proposed'::public.project_assignment_terms_status,
    v_user_id,
    now()
  )
  RETURNING id INTO v_terms_id;

  UPDATE public.project_assignments
  SET status = 'terms_negotiation'::public.project_assignment_status,
      active_terms_id = v_terms_id,
      updated_at = now()
  WHERE id = p_assignment_id;

  RETURN v_terms_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_project_assignment_compensation(p_assignment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_assignment public.project_assignments%rowtype;
  v_reservation_id uuid;
  v_pool_reservation_id uuid;
  v_reference text;
BEGIN
  SELECT a.* INTO v_assignment
  FROM public.project_assignments a
  JOIN public.projects p ON p.id = a.project_id
  WHERE a.id = p_assignment_id
    AND p.creator_id = v_user_id
  FOR UPDATE OF a;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  IF v_assignment.status <> 'accepted'::public.project_assignment_status THEN
    RAISE EXCEPTION 'assignment must be accepted before reserving compensation' USING errcode = '55000';
  END IF;

  PERFORM public.assert_project_assignments_allowed(v_assignment.project_id);

  IF EXISTS (
    SELECT 1 FROM public.project_assignment_reservations r WHERE r.assignment_id = p_assignment_id
  ) THEN
    RETURN (
      SELECT r.pool_reservation_id
      FROM public.project_assignment_reservations r
      WHERE r.assignment_id = p_assignment_id
    );
  END IF;

  v_reference := 'project_assignment_reserve:' || p_assignment_id::text;

  v_pool_reservation_id := public.reserve_project_pool_kobo(
    v_assignment.project_id,
    public.kobo_to_ngn_major(v_assignment.compensation_total_kobo),
    v_reference,
    'assignment compensation'
  );

  UPDATE public.project_pool_reservations pr
  SET assignment_id = p_assignment_id
  WHERE pr.id = v_pool_reservation_id;

  INSERT INTO public.project_assignment_reservations (
    assignment_id,
    pool_reservation_id,
    amount_kobo
  )
  VALUES (p_assignment_id, v_pool_reservation_id, v_assignment.compensation_total_kobo)
  RETURNING pool_reservation_id INTO v_reservation_id;

  UPDATE public.project_funding_pools pool
  SET committed_compensation_kobo = pool.committed_compensation_kobo + v_assignment.compensation_total_kobo
  WHERE pool.project_id = v_assignment.project_id;

  RETURN v_pool_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_project_assignment_reservation(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_assignment public.project_assignments%rowtype;
  v_link public.project_assignment_reservations%rowtype;
BEGIN
  SELECT a.* INTO v_assignment
  FROM public.project_assignments a
  JOIN public.projects p ON p.id = a.project_id
  WHERE a.id = p_assignment_id
    AND p.creator_id = v_user_id
  FOR UPDATE OF a;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  IF v_assignment.status = 'commenced'::public.project_assignment_status THEN
    RAISE EXCEPTION 'cannot release reservation after work has commenced' USING errcode = '55000';
  END IF;

  SELECT * INTO v_link
  FROM public.project_assignment_reservations r
  WHERE r.assignment_id = p_assignment_id
  FOR UPDATE;

  IF v_link.assignment_id IS NULL THEN
    RETURN;
  END IF;

  IF v_link.released_kobo > 0 THEN
    RAISE EXCEPTION 'cannot release reservation after payouts' USING errcode = '55000';
  END IF;

  PERFORM public.release_project_pool_reservation(
    v_link.pool_reservation_id,
    'assignment_release:' || p_assignment_id::text
  );

  UPDATE public.project_funding_pools pool
  SET committed_compensation_kobo = pool.committed_compensation_kobo - v_link.amount_kobo
  WHERE pool.project_id = v_assignment.project_id
    AND pool.committed_compensation_kobo >= v_link.amount_kobo;

  DELETE FROM public.project_assignment_reservations r WHERE r.assignment_id = p_assignment_id;
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
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_assignment public.project_assignments%rowtype;
  v_submission_id uuid;
BEGIN
  SELECT * INTO v_assignment FROM public.project_assignments WHERE id = p_assignment_id FOR UPDATE;

  IF v_assignment.id IS NULL OR v_assignment.worker_id <> v_user_id THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  IF v_assignment.status <> 'commenced'::public.project_assignment_status THEN
    RAISE EXCEPTION 'assignment is not in progress' USING errcode = '55000';
  END IF;

  INSERT INTO public.project_assignment_submissions (
    assignment_id,
    milestone_id,
    submitted_by,
    note
  )
  VALUES (p_assignment_id, p_milestone_id, v_user_id, nullif(btrim(p_note), ''))
  RETURNING id INTO v_submission_id;

  IF p_milestone_id IS NOT NULL THEN
    UPDATE public.project_assignment_milestones m
    SET status = 'submitted'::public.milestone_status,
        submitted_at = now(),
        submitted_by = v_user_id
    WHERE m.id = p_milestone_id AND m.assignment_id = p_assignment_id;
  END IF;

  RETURN v_submission_id;
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
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_assignment public.project_assignments%rowtype;
  v_reservation public.project_assignment_reservations%rowtype;
  v_milestone public.project_assignment_milestones%rowtype;
  v_charge record;
  v_provider_kobo bigint;
  v_fee_kobo bigint;
  v_total_kobo bigint;
  v_reference text;
  v_payment_id uuid;
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

  SELECT * INTO v_reservation
  FROM public.project_assignment_reservations r
  WHERE r.assignment_id = p_assignment_id
  FOR UPDATE;

  IF v_reservation.assignment_id IS NULL THEN
    RAISE EXCEPTION 'assignment compensation is not secured' USING errcode = '55000';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  v_reference := 'project_assignment_payout:' || p_idempotency_key;

  IF EXISTS (
    SELECT 1 FROM public.project_assignment_payments pay WHERE pay.wallet_reference = v_reference
  ) THEN
    RETURN (SELECT pay.id FROM public.project_assignment_payments pay WHERE pay.wallet_reference = v_reference);
  END IF;

  IF p_milestone_id IS NOT NULL THEN
    SELECT * INTO v_milestone
    FROM public.project_assignment_milestones m
    WHERE m.id = p_milestone_id AND m.assignment_id = p_assignment_id
    FOR UPDATE;

    IF v_milestone.id IS NULL THEN
      RAISE EXCEPTION 'milestone not found' USING errcode = 'P0002';
    END IF;

    IF v_milestone.status <> 'submitted'::public.milestone_status THEN
      RAISE EXCEPTION 'milestone must be submitted before approval' USING errcode = '55000';
    END IF;

    v_provider_kobo := v_milestone.provider_kobo;
    v_fee_kobo := v_milestone.fee_kobo;
    v_total_kobo := v_milestone.total_kobo;
  ELSE
    IF v_assignment.payment_structure <> 'single'::public.payment_structure THEN
      RAISE EXCEPTION 'milestone id is required for milestone assignments' USING errcode = '22023';
    END IF;

    SELECT s.id INTO v_submission_id
    FROM public.project_assignment_submissions s
    WHERE s.assignment_id = p_assignment_id
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_submission_id IS NULL THEN
      RAISE EXCEPTION 'no submission to approve' USING errcode = '55000';
    END IF;

    SELECT * INTO v_charge FROM public.compute_request_charge(
      v_assignment.compensation_total_kobo::numeric / 100.0
    );
    v_provider_kobo := public.ngn_major_to_kobo(v_charge.provider_amount);
    v_fee_kobo := public.ngn_major_to_kobo(v_charge.service_fee);
    v_total_kobo := v_assignment.compensation_total_kobo;
  END IF;

  IF v_reservation.released_kobo + v_total_kobo > v_reservation.amount_kobo THEN
    RAISE EXCEPTION 'payout would exceed secured assignment compensation' USING errcode = '55000';
  END IF;

  PERFORM public.wallet_credit_kobo(
    v_reference || ':payout',
    v_assignment.worker_id,
    v_provider_kobo,
    'project_assignment_payout'::public.wallet_transaction_type,
    'Project assignment payment',
    NULL,
    NULL,
    jsonb_build_object('project_id', v_assignment.project_id, 'assignment_id', p_assignment_id)
  );

  UPDATE public.wallet_transactions wt
  SET project_id = v_assignment.project_id
  WHERE wt.reference = v_reference || ':payout';

  IF v_fee_kobo > 0 THEN
    PERFORM public.wallet_apply_entry(
      v_reference || ':fee',
      v_assignment.creator_id,
      NULL,
      'service_fee'::public.wallet_transaction_type,
      0,
      0,
      'Project assignment service fee',
      jsonb_build_object('project_id', v_assignment.project_id, 'assignment_id', p_assignment_id),
      NULL,
      v_fee_kobo
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
    v_provider_kobo,
    v_fee_kobo,
    v_total_kobo,
    v_reference
  )
  RETURNING id INTO v_payment_id;

  IF v_submission_id IS NOT NULL THEN
    INSERT INTO public.project_assignment_approvals (submission_id, approved_by)
    VALUES (v_submission_id, v_user_id);
  END IF;

  IF p_milestone_id IS NOT NULL THEN
    UPDATE public.project_assignment_milestones
    SET status = 'approved_paid'::public.milestone_status,
        approved_at = now(),
        approved_by = v_user_id,
        payout_reference = v_reference
    WHERE id = p_milestone_id;
  END IF;

  UPDATE public.project_assignment_reservations
  SET released_kobo = released_kobo + v_total_kobo
  WHERE assignment_id = p_assignment_id;

  IF v_reservation.released_kobo + v_total_kobo = v_reservation.amount_kobo THEN
    UPDATE public.project_assignments
    SET status = 'completed'::public.project_assignment_status,
        completed_at = now(),
        updated_at = now()
    WHERE id = p_assignment_id;
  END IF;

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_project_assignment(p_assignment_id uuid)
RETURNS TABLE(
  assignment_id uuid,
  project_id uuid,
  creator_id uuid,
  worker_id uuid,
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
  viewer_is_creator boolean,
  viewer_is_worker boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.project_id,
    a.creator_id,
    a.worker_id,
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
    r.amount_kobo,
    r.released_kobo,
    a.creator_id = v_user_id,
    a.worker_id = v_user_id
  FROM public.project_assignments a
  JOIN public.project_assignment_terms t ON t.id = a.active_terms_id
  LEFT JOIN public.project_assignment_reservations r ON r.assignment_id = a.id
  WHERE a.id = p_assignment_id
    AND (
      a.creator_id = v_user_id
      OR a.worker_id = v_user_id
    );
END;
$$;

ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assignment_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assignment_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assignment_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assignment_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assignment_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assignment_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.project_assignments FROM PUBLIC;
REVOKE ALL ON TABLE public.project_assignment_terms FROM PUBLIC;
REVOKE ALL ON TABLE public.project_assignment_reservations FROM PUBLIC;
REVOKE ALL ON TABLE public.project_assignment_milestones FROM PUBLIC;
REVOKE ALL ON TABLE public.project_assignment_submissions FROM PUBLIC;
REVOKE ALL ON TABLE public.project_assignment_revisions FROM PUBLIC;
REVOKE ALL ON TABLE public.project_assignment_approvals FROM PUBLIC;
REVOKE ALL ON TABLE public.project_assignment_payments FROM PUBLIC;

GRANT SELECT ON TABLE public.project_assignments TO service_role;
GRANT SELECT ON TABLE public.project_assignment_terms TO service_role;
GRANT SELECT ON TABLE public.project_assignment_reservations TO service_role;
GRANT SELECT ON TABLE public.project_assignment_milestones TO service_role;
GRANT SELECT ON TABLE public.project_assignment_submissions TO service_role;
GRANT SELECT ON TABLE public.project_assignment_revisions TO service_role;
GRANT SELECT ON TABLE public.project_assignment_approvals TO service_role;
GRANT SELECT ON TABLE public.project_assignment_payments TO service_role;

GRANT EXECUTE ON FUNCTION public.create_project_assignment(
  uuid, uuid, text, text, text, public.payment_structure, numeric, timestamptz, jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_project_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.propose_project_assignment_terms(
  uuid, text, text, text, public.payment_structure, numeric, timestamptz, jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_project_assignment_compensation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_project_assignment_reservation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_project_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_project_assignment_work(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_and_payout_project_assignment(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_assignment(uuid) TO authenticated;