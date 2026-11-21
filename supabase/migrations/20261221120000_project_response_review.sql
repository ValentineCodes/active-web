-- Creator review of worker-initiated project responses (accept / reject).
--
-- Compatibility: worker responses share project_assignments with creator-proposed
-- assignments. Creator acceptance (this migration) sets mutual agreement when the
-- worker proposed active terms. Worker acceptance of creator-proposed terms remains
-- accept_project_assignment. Creator accept (accept_project_worker_response) reserves pool funds.

CREATE OR REPLACE FUNCTION public.project_worker_response_awaiting_creator_review(p_assignment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_assignments a
    JOIN public.project_assignment_terms t ON t.id = a.active_terms_id
    WHERE a.id = p_assignment_id
      AND a.status = ANY (
        ARRAY[
          'offered'::public.project_assignment_status,
          'terms_negotiation'::public.project_assignment_status
        ]
      )
      AND t.proposed_by = a.worker_id
      AND t.worker_agreed_at IS NOT NULL
      AND t.creator_agreed_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.project_assignment_reservations r
        WHERE r.assignment_id = a.id
      )
  );
$$;

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

GRANT EXECUTE ON FUNCTION public.accept_project_worker_response(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_project_worker_response(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.list_project_responses(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.list_project_responses(
  p_project_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  assignment_id uuid,
  worker_id uuid,
  display_name text,
  avatar_path text,
  bio text,
  rating_average numeric,
  rating_count integer,
  completion_percent integer,
  identity_verified boolean,
  message text,
  quoted_amount numeric,
  status public.project_assignment_status,
  created_at timestamptz,
  proposed_delivery_duration_value integer,
  proposed_delivery_duration_unit public.delivery_duration_unit,
  proposed_delivery_at timestamptz,
  proposed_delivery_timezone text,
  responder_available boolean,
  terms_proposed_by uuid,
  creator_may_review boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_limit integer := LEAST(GREATEST(coalesce(p_limit, 50), 1), 50);
  v_offset integer := GREATEST(coalesce(p_offset, 0), 0);
  v_is_creator boolean;
  v_is_contributor boolean;
BEGIN
  PERFORM public.assert_may_view_project(p_project_id, v_user_id);

  SELECT p.creator_id = v_user_id INTO v_is_creator
  FROM public.projects p
  WHERE p.id = p_project_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.project_contributions pc
    WHERE pc.project_id = p_project_id
      AND pc.contributor_id = v_user_id
  )
  INTO v_is_contributor;

  IF NOT (v_is_creator OR v_is_contributor) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.worker_id,
    p.display_name,
    p.avatar_path,
    p.bio,
    p.rating_average,
    p.rating_count,
    public.provider_completion_percent(p.id) AS completion_percent,
    public.user_marketplace_identity_verified(p.id) AS identity_verified,
    nullif(btrim(t.description), ''),
    public.kobo_to_ngn_major(a.compensation_total_kobo),
    a.status,
    a.created_at,
    t.proposed_delivery_duration_value,
    t.proposed_delivery_duration_unit,
    a.due_at,
    NULL::text,
    true,
    t.proposed_by,
    (
      v_is_creator
      AND public.project_worker_response_awaiting_creator_review(a.id)
    )
  FROM public.project_assignments a
  JOIN public.project_assignment_terms t ON t.id = a.active_terms_id
  JOIN public.profiles p ON p.id = a.worker_id
  WHERE a.project_id = p_project_id
    AND a.status <> 'cancelled'::public.project_assignment_status
  ORDER BY
    CASE a.status
      WHEN 'offered'::public.project_assignment_status THEN 0
      WHEN 'terms_negotiation'::public.project_assignment_status THEN 1
      WHEN 'accepted'::public.project_assignment_status THEN 2
      WHEN 'commenced'::public.project_assignment_status THEN 3
      WHEN 'completed'::public.project_assignment_status THEN 4
      ELSE 5
    END,
    a.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_project_responses(uuid, integer, integer) TO authenticated;