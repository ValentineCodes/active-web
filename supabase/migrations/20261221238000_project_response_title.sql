-- Worker responses use the project title instead of a generic placeholder on terms.

CREATE OR REPLACE FUNCTION public.respond_to_project(
  p_project_id uuid,
  p_message text DEFAULT NULL,
  p_compensation_major numeric DEFAULT NULL,
  p_proposed_delivery_duration_value integer DEFAULT NULL,
  p_proposed_delivery_duration_unit public.delivery_duration_unit DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_project public.projects%rowtype;
  v_duration_seconds bigint;
  v_compensation_kobo bigint;
  v_due_at timestamptz;
  v_assignment_id uuid;
  v_terms_id uuid;
  v_message text := coalesce(btrim(p_message), '');
  v_existing_id uuid;
  v_next_version integer;
BEGIN
  PERFORM public.assert_may_view_project(p_project_id, v_user_id);

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
  END IF;

  IF v_project.creator_id = v_user_id THEN
    RAISE EXCEPTION 'creator cannot respond to own project' USING errcode = '55000';
  END IF;

  IF v_project.funding_status = 'unsuccessful'::public.project_funding_status
     OR v_project.status = 'funding_unsuccessful'::public.project_status THEN
    RAISE EXCEPTION 'project is not open for responses' USING errcode = '55000';
  END IF;

  v_duration_seconds := public.assert_valid_proposed_delivery_duration(
    p_proposed_delivery_duration_value,
    p_proposed_delivery_duration_unit
  );
  v_due_at := now() + make_interval(secs => v_duration_seconds::double precision);

  IF p_compensation_major IS NULL OR p_compensation_major <= 0 THEN
    RAISE EXCEPTION 'compensation must be positive' USING errcode = '22023';
  END IF;

  v_compensation_kobo := public.ngn_major_to_kobo(p_compensation_major);
  IF v_compensation_kobo <= 0 THEN
    RAISE EXCEPTION 'compensation must be positive' USING errcode = '22023';
  END IF;

  IF v_compensation_kobo > v_project.budget_total_kobo THEN
    RAISE EXCEPTION 'compensation exceeds project budget' USING errcode = '22023';
  END IF;

  SELECT a.id
  INTO v_existing_id
  FROM public.project_assignments a
  JOIN public.project_assignment_terms t ON t.id = a.active_terms_id
  WHERE a.project_id = p_project_id
    AND a.worker_id = v_user_id
    AND a.status IN (
      'offered'::public.project_assignment_status,
      'terms_negotiation'::public.project_assignment_status
    )
    AND t.proposed_by = v_user_id
    AND t.creator_agreed_at IS NULL
  FOR UPDATE OF a;

  IF v_existing_id IS NOT NULL THEN
  IF EXISTS (
    SELECT 1 FROM public.project_assignment_reservations r WHERE r.assignment_id = v_existing_id
  ) THEN
    RAISE EXCEPTION 'cannot change response after compensation is reserved' USING errcode = '55000';
  END IF;

    SELECT coalesce(max(t.version), 0) + 1
    INTO v_next_version
    FROM public.project_assignment_terms t
    WHERE t.assignment_id = v_existing_id;

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
      worker_agreed_at,
      proposed_delivery_duration_seconds,
      proposed_delivery_duration_value,
      proposed_delivery_duration_unit
    )
    VALUES (
      v_existing_id,
      v_next_version,
      v_project.title,
      v_message,
      '',
      v_compensation_kobo,
      'single'::public.payment_structure,
      v_due_at,
      NULL,
      'proposed'::public.project_assignment_terms_status,
      v_user_id,
      now(),
      v_duration_seconds,
      p_proposed_delivery_duration_value,
      p_proposed_delivery_duration_unit
    )
    RETURNING id INTO v_terms_id;

    UPDATE public.project_assignments
    SET status = 'terms_negotiation'::public.project_assignment_status,
        active_terms_id = v_terms_id,
        compensation_total_kobo = v_compensation_kobo,
        due_at = v_due_at,
        updated_at = now()
    WHERE id = v_existing_id;

    RETURN v_existing_id;
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
    v_project.creator_id,
    v_user_id,
    'single'::public.payment_structure,
    v_compensation_kobo,
    v_due_at
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
    worker_agreed_at,
    proposed_delivery_duration_seconds,
    proposed_delivery_duration_value,
    proposed_delivery_duration_unit
  )
  VALUES (
    v_assignment_id,
    1,
    v_project.title,
    v_message,
    '',
    v_compensation_kobo,
    'single'::public.payment_structure,
    v_due_at,
    NULL,
    'proposed'::public.project_assignment_terms_status,
    v_user_id,
    now(),
    v_duration_seconds,
    p_proposed_delivery_duration_value,
    p_proposed_delivery_duration_unit
  )
  RETURNING id INTO v_terms_id;

  UPDATE public.project_assignments
  SET active_terms_id = v_terms_id,
      updated_at = now()
  WHERE id = v_assignment_id;

  RETURN v_assignment_id;
END;
$$;

UPDATE public.project_assignment_terms t
SET title = p.title
FROM public.project_assignments a
JOIN public.projects p ON p.id = a.project_id
WHERE t.assignment_id = a.id
  AND btrim(t.title) = 'Your project response';