-- Project accept/reject notifications must not use response_id (FK to request_responses).

CREATE OR REPLACE FUNCTION public.accept_project_worker_response(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_assignment public.project_assignments%rowtype;
  v_terms public.project_assignment_terms%rowtype;
  v_project public.projects%rowtype;
  v_creator_name text;
  v_creator_first text;
BEGIN
  SELECT a.*
  INTO v_assignment
  FROM public.project_assignments a
  JOIN public.projects p ON p.id = a.project_id
  WHERE a.id = p_assignment_id
    AND p.creator_id = v_user_id
  FOR UPDATE OF a;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_terms
  FROM public.project_assignment_terms t
  WHERE t.id = v_assignment.active_terms_id
  FOR UPDATE;

  IF v_assignment.status = 'accepted'::public.project_assignment_status
     AND v_terms.status = 'agreed'::public.project_assignment_terms_status
     AND v_terms.proposed_by = v_assignment.worker_id
     AND v_terms.creator_agreed_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF NOT public.project_worker_response_awaiting_creator_review(p_assignment_id) THEN
    RAISE EXCEPTION 'this response is no longer available for acceptance' USING errcode = '55000';
  END IF;

  PERFORM public.assert_project_assignments_allowed(v_assignment.project_id);

  UPDATE public.project_assignment_terms
  SET status = 'agreed'::public.project_assignment_terms_status,
      creator_agreed_at = now()
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

  SELECT * INTO v_project FROM public.projects WHERE id = v_assignment.project_id;

  SELECT p.display_name INTO v_creator_name
  FROM public.profiles p
  WHERE p.id = v_user_id;

  v_creator_first := coalesce(public.display_first_name(v_creator_name), 'The project creator');

  PERFORM public.create_notification(
    v_assignment.worker_id,
    'project_assignment:' || p_assignment_id::text || ':accepted_by_creator',
    'response_accepted'::public.notification_type,
    format('%s accepted your project response', v_creator_first),
    'Open the project to chat and coordinate. Compensation must be secured before work can start.',
    format('/project/%s', v_assignment.project_id),
    NULL,
    NULL,
    NULL,
    NULL,
    v_user_id,
    jsonb_build_object(
      'project_id', v_assignment.project_id,
      'assignment_id', p_assignment_id
    ),
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_project_worker_response(
  p_assignment_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_assignment public.project_assignments%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_creator_name text;
  v_creator_first text;
  v_body text;
BEGIN
  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'rejection reason must be 500 characters or fewer' USING errcode = '22023';
  END IF;

  SELECT a.*
  INTO v_assignment
  FROM public.project_assignments a
  JOIN public.projects p ON p.id = a.project_id
  WHERE a.id = p_assignment_id
    AND p.creator_id = v_user_id
  FOR UPDATE OF a;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  IF v_assignment.status = 'cancelled'::public.project_assignment_status THEN
    RETURN;
  END IF;

  IF NOT public.project_worker_response_awaiting_creator_review(p_assignment_id) THEN
    RAISE EXCEPTION 'this response is no longer available for rejection' USING errcode = '55000';
  END IF;

  UPDATE public.project_assignments
  SET status = 'cancelled'::public.project_assignment_status,
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_assignment_id;

  SELECT p.display_name INTO v_creator_name
  FROM public.profiles p
  WHERE p.id = v_user_id;

  v_creator_first := coalesce(public.display_first_name(v_creator_name), 'The project creator');

  IF v_reason IS NOT NULL THEN
    v_body := format(
      '%s decided not to select you. They said: %s',
      v_creator_first,
      v_reason
    );
  ELSE
    v_body := format('%s decided not to select you for this project.', v_creator_first);
  END IF;

  PERFORM public.create_notification(
    v_assignment.worker_id,
    'project_assignment:' || p_assignment_id::text || ':rejected_by_creator',
    'response_not_selected'::public.notification_type,
    'Not selected',
    v_body,
    format('/project/%s', v_assignment.project_id),
    NULL,
    NULL,
    NULL,
    NULL,
    v_user_id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'decline_reason', v_reason,
        'project_id', v_assignment.project_id,
        'assignment_id', p_assignment_id
      )
    ),
    true
  );
END;
$$;