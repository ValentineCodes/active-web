-- accept_response milestone branch, workflow RPCs, single-payment guards.

CREATE OR REPLACE FUNCTION public.accept_response(p_response_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_request_id uuid;
  v_selected_user_id uuid;
  v_request_status public.request_status;
  v_response_status public.response_status;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_request_expires_at timestamptz;
  v_offered_amount numeric;
  v_quoted_amount numeric;
  v_agreed_provider_amount numeric;
  v_accepted uuid;
  v_locked_request_id uuid;
  v_requester_name text;
  v_requester_first text;
  v_handshake_key text;
  v_payment_structure public.payment_structure;
  v_proposal_id uuid;
BEGIN
  SELECT rr.request_id
    INTO v_request_id
  FROM public.request_responses rr
  JOIN public.requests r ON r.id = rr.request_id
  WHERE rr.id = p_response_id
    AND r.requester_id = v_user_id;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'response not found' USING errcode = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.handshakes h
    JOIN public.requests r ON r.id = h.request_id
    WHERE h.request_id = v_request_id
      AND h.response_id = p_response_id
      AND r.accepted_response_id = p_response_id
      AND r.selected_user_id IS NOT NULL
      AND r.status = ANY (
        ARRAY[
          'accepted'::public.request_status,
          'in_progress'::public.request_status,
          'completion_pending'::public.request_status,
          'disputed'::public.request_status
        ]
      )
  ) THEN
    RETURN v_request_id;
  END IF;

  SELECT r.status, r.payment_status, r.requester_id, r.expires_at, r.offered_amount, r.payment_structure
    INTO v_request_status, v_payment, v_requester_id, v_request_expires_at, v_offered_amount, v_payment_structure
  FROM public.requests r
  WHERE r.id = v_request_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.requests r
    WHERE r.id = v_request_id
      AND r.selected_user_id IS NOT NULL
      AND r.status = ANY (public.attending_request_statuses())
  ) THEN
    RAISE EXCEPTION 'someone is already helping on this request' USING errcode = '55000';
  END IF;

  IF v_request_status NOT IN (
    'posted'::public.request_status,
    'awaiting_review'::public.request_status
  ) THEN
    RAISE EXCEPTION 'this request is no longer open for selection' USING errcode = '55000';
  END IF;

  IF v_request_status = 'posted'::public.request_status
     AND v_request_expires_at IS NOT NULL
     AND v_request_expires_at > now() THEN
    NULL;
  ELSIF v_request_status = 'awaiting_review'::public.request_status
     OR (
       v_request_status = 'posted'::public.request_status
       AND v_request_expires_at IS NOT NULL
       AND v_request_expires_at <= now()
     ) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'this request is no longer open for selection' USING errcode = '55000';
  END IF;

  SELECT rr.request_id, rr.responder_id, rr.status, rr.quoted_amount
    INTO v_locked_request_id, v_selected_user_id, v_response_status, v_quoted_amount
  FROM public.request_responses rr
  WHERE rr.id = p_response_id
  FOR UPDATE;

  IF v_locked_request_id IS DISTINCT FROM v_request_id
     OR v_response_status IS DISTINCT FROM 'pending'::public.response_status THEN
    RAISE EXCEPTION 'this response is no longer available' USING errcode = '55000';
  END IF;

  v_agreed_provider_amount := coalesce(nullif(v_quoted_amount, 0), v_offered_amount);

  IF v_agreed_provider_amount IS NULL OR v_agreed_provider_amount <= 0 THEN
    RAISE EXCEPTION 'this request has no agreed payment amount' USING errcode = '55000';
  END IF;

  IF v_payment_structure = 'milestone'::public.payment_structure THEN
    v_proposal_id := public.resolve_milestone_proposal_for_accept(v_request_id, p_response_id);
    PERFORM public.validate_proposal_matches_total(v_proposal_id, v_agreed_provider_amount);
  END IF;

  PERFORM pg_advisory_xact_lock(4242, hashtext(v_selected_user_id::text));

  PERFORM 1
  FROM public.requests existing
  WHERE existing.selected_user_id = v_selected_user_id
    AND existing.status = ANY (public.attending_request_statuses())
  FOR UPDATE;

  PERFORM public.assert_responder_available_for_selection(v_selected_user_id, v_request_id);

  v_handshake_key := 'handshake:' || v_request_id::text || ':' || p_response_id::text;

  IF v_payment = 'not_required'::public.payment_status THEN
    PERFORM public.lock_request_escrow_for_amount(
      v_request_id,
      v_agreed_provider_amount,
      v_handshake_key
    );
  ELSIF v_payment = 'locked'::public.payment_status THEN
    PERFORM public.align_request_escrow_to_agreed_amount(
      v_request_id,
      v_agreed_provider_amount,
      v_handshake_key
    );
  ELSE
    RAISE EXCEPTION 'this request cannot be accepted for payment' USING errcode = '55000';
  END IF;

  UPDATE public.request_responses
  SET status = 'accepted', resolved_at = now()
  WHERE id = p_response_id
    AND status = 'pending'
  RETURNING id INTO v_accepted;

  IF v_accepted IS NULL THEN
    RAISE EXCEPTION 'this response is no longer available' USING errcode = '55000';
  END IF;

  UPDATE public.requests
  SET status = 'accepted',
      accepted_at = now(),
      accepted_response_id = p_response_id,
      selected_user_id = v_selected_user_id,
      agreed_provider_amount = v_agreed_provider_amount
  WHERE id = v_request_id
    AND status IN (
      'posted'::public.request_status,
      'awaiting_review'::public.request_status
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'this request is no longer open for selection' USING errcode = '55000';
  END IF;

  IF v_payment_structure = 'milestone'::public.payment_structure THEN
    PERFORM public.snapshot_engagement_milestones(v_request_id, v_proposal_id);
  END IF;

  PERFORM public.set_user_attendance(v_selected_user_id, v_request_id);

  INSERT INTO public.handshakes (request_id, response_id, requester_id, selected_user_id)
  VALUES (v_request_id, p_response_id, v_requester_id, v_selected_user_id);

  PERFORM public.ensure_request_conversation(
    v_request_id,
    v_requester_id,
    v_selected_user_id,
    p_response_id
  );

  SELECT p.display_name
    INTO v_requester_name
  FROM public.profiles p
  WHERE p.id = v_requester_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'them');

  PERFORM public.create_notification(
    v_selected_user_id,
    'request:' || v_request_id::text || ':accepted',
    'response_accepted'::public.notification_type,
    format('You''re helping %s now', v_requester_first),
    'Open the request to chat, see contact details, and where to meet.',
    format('/engagement/%s', v_request_id),
    v_request_id,
    p_response_id,
    NULL,
    NULL,
    v_requester_id,
    NULL,
    true
  );

  PERFORM public.apply_payment_transition(
    v_request_id,
    'pending'::public.payment_status,
    v_handshake_key
  );

  RETURN v_request_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Milestone work transitions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_status public.request_status;
  v_requester_id uuid;
  v_payment_structure public.payment_structure;
  v_helper_name text;
  v_helper_first text;
  v_first_milestone_id uuid;
BEGIN
  SELECT status, requester_id, payment_structure
    INTO v_status, v_requester_id, v_payment_structure
  FROM public.requests
  WHERE id = p_request_id AND selected_user_id = v_user_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_status = 'in_progress' THEN
    IF v_payment_structure = 'milestone'::public.payment_structure THEN
      UPDATE public.engagement_milestones
      SET status = 'in_progress'::public.milestone_status
      WHERE request_id = p_request_id
        AND position = 1
        AND status = 'pending'::public.milestone_status;
    END IF;
    RETURN;
  END IF;

  IF v_status <> 'accepted' THEN
    RAISE EXCEPTION 'only a selected request can be started' USING errcode = '55000';
  END IF;

  UPDATE public.requests
  SET status = 'in_progress',
      started_at = now()
  WHERE id = p_request_id;

  PERFORM public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'in_progress'::public.request_status,
    'start:' || p_request_id::text
  );

  IF v_payment_structure = 'milestone'::public.payment_structure THEN
    SELECT em.id INTO v_first_milestone_id
    FROM public.engagement_milestones em
    WHERE em.request_id = p_request_id AND em.position = 1
    FOR UPDATE;

    IF v_first_milestone_id IS NULL THEN
      RAISE EXCEPTION 'milestone engagement is missing milestones' USING errcode = '55000';
    END IF;

    UPDATE public.engagement_milestones
    SET status = 'in_progress'::public.milestone_status
    WHERE id = v_first_milestone_id
      AND status = 'pending'::public.milestone_status;
  END IF;

  SELECT p.display_name INTO v_helper_name
  FROM public.profiles p
  WHERE p.id = v_user_id;

  v_helper_first := coalesce(public.display_first_name(v_helper_name), 'Your helper');

  PERFORM public.create_notification(
    v_requester_id,
    'request:' || p_request_id::text || ':started',
    'response_accepted'::public.notification_type,
    'In progress',
    format('%s has started helping you.', v_helper_first),
    format('/engagement/%s', p_request_id),
    p_request_id,
    NULL,
    NULL,
    NULL,
    v_user_id,
    NULL,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_engagement_milestone(p_milestone_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_milestone public.engagement_milestones%rowtype;
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_payment_structure public.payment_structure;
  v_request_status public.request_status;
  v_payment public.payment_status;
  v_prior_unpaid integer;
BEGIN
  SELECT em.* INTO v_milestone
  FROM public.engagement_milestones em
  WHERE em.id = p_milestone_id
  FOR UPDATE;

  IF v_milestone.id IS NULL THEN
    RAISE EXCEPTION 'milestone not found' USING errcode = 'P0002';
  END IF;

  SELECT r.requester_id, r.selected_user_id, r.payment_structure, r.status, r.payment_status
    INTO v_requester_id, v_selected_user_id, v_payment_structure, v_request_status, v_payment
  FROM public.requests r
  WHERE r.id = v_milestone.request_id
  FOR UPDATE;

  IF v_requester_id IS NULL OR v_payment_structure <> 'milestone'::public.payment_structure THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_request_status = 'disputed'::public.request_status OR v_payment = 'disputed'::public.payment_status THEN
    RAISE EXCEPTION 'this request is disputed' USING errcode = '55000';
  END IF;

  IF v_selected_user_id <> v_user_id THEN
    RAISE EXCEPTION 'only the helper can submit a milestone' USING errcode = '42501';
  END IF;

  IF v_milestone.position > 1 THEN
    SELECT count(*)::int INTO v_prior_unpaid
    FROM public.engagement_milestones em
    WHERE em.request_id = v_milestone.request_id
      AND em.position < v_milestone.position
      AND em.status <> 'approved_paid'::public.milestone_status;

    IF v_prior_unpaid > 0 THEN
      RAISE EXCEPTION 'earlier milestones must be approved before submitting this one' USING errcode = '55000';
    END IF;
  END IF;

  IF v_milestone.status = 'in_progress'::public.milestone_status THEN
    UPDATE public.engagement_milestones
    SET status = 'submitted'::public.milestone_status,
        submitted_at = now(),
        submitted_by = v_user_id
    WHERE id = p_milestone_id;
    RETURN;
  END IF;

  IF v_milestone.status = 'revision_requested'::public.milestone_status THEN
    UPDATE public.engagement_milestones
    SET status = 'submitted'::public.milestone_status,
        submitted_at = now(),
        submitted_by = v_user_id
    WHERE id = p_milestone_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'milestone cannot be submitted in its current state' USING errcode = '55000';
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_engagement_milestone(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_engagement_milestone_revision(p_milestone_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_milestone public.engagement_milestones%rowtype;
  v_requester_id uuid;
  v_payment_structure public.payment_structure;
  v_request_status public.request_status;
  v_payment public.payment_status;
BEGIN
  SELECT em.* INTO v_milestone
  FROM public.engagement_milestones em
  WHERE em.id = p_milestone_id
  FOR UPDATE;

  IF v_milestone.id IS NULL THEN
    RAISE EXCEPTION 'milestone not found' USING errcode = 'P0002';
  END IF;

  SELECT r.requester_id, r.payment_structure, r.status, r.payment_status
    INTO v_requester_id, v_payment_structure, v_request_status, v_payment
  FROM public.requests r
  WHERE r.id = v_milestone.request_id
  FOR UPDATE;

  IF v_requester_id IS NULL OR v_payment_structure <> 'milestone'::public.payment_structure THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_request_status = 'disputed'::public.request_status OR v_payment = 'disputed'::public.payment_status THEN
    RAISE EXCEPTION 'this request is disputed' USING errcode = '55000';
  END IF;

  IF v_requester_id <> v_user_id THEN
    RAISE EXCEPTION 'only the requester can request a revision' USING errcode = '42501';
  END IF;

  IF v_milestone.status <> 'submitted'::public.milestone_status THEN
    RAISE EXCEPTION 'only a submitted milestone can be sent back for revision' USING errcode = '55000';
  END IF;

  UPDATE public.engagement_milestones
  SET status = 'revision_requested'::public.milestone_status,
      revision_requested_at = now(),
      revision_requested_by = v_user_id
  WHERE id = p_milestone_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_engagement_milestone_revision(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_engagement_milestone(p_milestone_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_milestone public.engagement_milestones%rowtype;
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_payment_structure public.payment_structure;
  v_request_status public.request_status;
  v_payment public.payment_status;
  v_reference text;
  v_is_final boolean;
  v_next_id uuid;
BEGIN
  SELECT em.* INTO v_milestone
  FROM public.engagement_milestones em
  WHERE em.id = p_milestone_id
  FOR UPDATE;

  IF v_milestone.id IS NULL THEN
    RAISE EXCEPTION 'milestone not found' USING errcode = 'P0002';
  END IF;

  IF v_milestone.status = 'approved_paid'::public.milestone_status THEN
    RETURN;
  END IF;

  SELECT r.requester_id, r.selected_user_id, r.payment_structure, r.status, r.payment_status
    INTO v_requester_id, v_selected_user_id, v_payment_structure, v_request_status, v_payment
  FROM public.requests r
  WHERE r.id = v_milestone.request_id
  FOR UPDATE;

  IF v_requester_id IS NULL OR v_payment_structure <> 'milestone'::public.payment_structure THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_request_status = 'disputed'::public.request_status OR v_payment = 'disputed'::public.payment_status THEN
    RAISE EXCEPTION 'this request is disputed' USING errcode = '55000';
  END IF;

  IF v_requester_id <> v_user_id THEN
    RAISE EXCEPTION 'only the requester can approve a milestone' USING errcode = '42501';
  END IF;

  IF v_milestone.status <> 'submitted'::public.milestone_status THEN
    RAISE EXCEPTION 'only a submitted milestone can be approved' USING errcode = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.engagement_milestones em
    WHERE em.request_id = v_milestone.request_id
      AND em.position < v_milestone.position
      AND em.status <> 'approved_paid'::public.milestone_status
  ) THEN
    RAISE EXCEPTION 'earlier milestones must be approved first' USING errcode = '55000';
  END IF;

  v_reference := 'milestone:' || v_milestone.id::text;

  PERFORM public.wallet_release_milestone_kobo(
    v_reference,
    v_milestone.request_id,
    v_selected_user_id,
    v_milestone.total_kobo,
    v_milestone.provider_kobo,
    v_milestone.fee_kobo,
    v_milestone.id
  );

  UPDATE public.engagement_milestones
  SET status = 'approved_paid'::public.milestone_status,
      approved_at = now(),
      approved_by = v_user_id,
      payout_reference = v_reference
  WHERE id = p_milestone_id;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.engagement_milestones em
    WHERE em.request_id = v_milestone.request_id
      AND em.position > v_milestone.position
  ) INTO v_is_final;

  IF v_is_final THEN
    PERFORM public.finalize_milestone_engagement(
      v_milestone.request_id,
      v_user_id,
      'milestone_approve:' || v_milestone.id::text
    );
  ELSE
    SELECT em.id INTO v_next_id
    FROM public.engagement_milestones em
    WHERE em.request_id = v_milestone.request_id
      AND em.position = v_milestone.position + 1
    FOR UPDATE;

    UPDATE public.engagement_milestones
    SET status = 'in_progress'::public.milestone_status
    WHERE id = v_next_id
      AND status = 'pending'::public.milestone_status;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_engagement_milestone(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Single-payment guards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_service_complete(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_status public.request_status;
  v_structure public.payment_structure;
BEGIN
  SELECT status, payment_structure INTO v_status, v_structure
  FROM public.requests
  WHERE id = p_request_id AND selected_user_id = v_user_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_structure = 'milestone'::public.payment_structure THEN
    RAISE EXCEPTION 'milestone engagements use per-milestone approval instead of marking the whole job complete'
      USING errcode = '55000';
  END IF;

  IF v_status IN ('completion_pending', 'completed') THEN
    RETURN;
  END IF;

  IF v_status NOT IN ('accepted', 'in_progress') THEN
    RAISE EXCEPTION 'only an active job can be marked complete' USING errcode = '55000';
  END IF;

  UPDATE public.requests
  SET status = 'completion_pending'::public.request_status,
      completion_confirm_by = now() + public.completion_confirmation_interval()
  WHERE id = p_request_id;

  PERFORM public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'completion_pending'::public.request_status,
    'mark_complete:' || p_request_id::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_status public.request_status;
  v_payment public.payment_status;
  v_structure public.payment_structure;
BEGIN
  SELECT status, payment_status, payment_structure
    INTO v_status, v_payment, v_structure
  FROM public.requests
  WHERE id = p_request_id AND requester_id = v_user_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_structure = 'milestone'::public.payment_structure THEN
    RAISE EXCEPTION 'milestone engagements are completed through milestone approval'
      USING errcode = '55000';
  END IF;

  IF v_status = 'completed' THEN
    RETURN;
  END IF;

  IF v_payment = 'disputed' THEN
    RAISE EXCEPTION 'disputed funds cannot be released through completion'
      USING errcode = '55000';
  END IF;

  IF v_status <> 'completion_pending' THEN
    RAISE EXCEPTION 'you can confirm completion only after your helper marks the request complete'
      USING errcode = '55000';
  END IF;

  IF NOT public.finalize_request_completion(
    p_request_id,
    v_user_id,
    'confirm_complete:' || p_request_id::text
  ) THEN
    RAISE EXCEPTION 'disputed funds cannot be released through completion'
      USING errcode = '55000';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_complete_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_status public.request_status;
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_confirm_by timestamptz;
  v_payment public.payment_status;
  v_structure public.payment_structure;
  v_finalized boolean;
BEGIN
  SELECT r.status, r.requester_id, r.selected_user_id, r.completion_confirm_by, r.payment_status, r.payment_structure
    INTO v_status, v_requester_id, v_selected_user_id, v_confirm_by, v_payment, v_structure
  FROM public.requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_structure = 'milestone'::public.payment_structure THEN
    RETURN false;
  END IF;

  IF v_status = 'completed' THEN
    RETURN false;
  END IF;

  IF v_status <> 'completion_pending' OR v_payment = 'disputed' THEN
    RETURN false;
  END IF;

  IF v_confirm_by IS NULL OR v_confirm_by > now() THEN
    RETURN false;
  END IF;

  v_finalized := public.finalize_request_completion(
    p_request_id,
    v_requester_id,
    'auto_complete:' || p_request_id::text
  );

  RETURN v_finalized;
END;
$$;

-- ---------------------------------------------------------------------------
-- Read APIs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_engagement_milestones(p_request_id uuid)
RETURNS TABLE (
  milestone_id uuid,
  milestone_position integer,
  title text,
  description text,
  amount_major numeric,
  status public.milestone_status,
  submitted_at timestamptz,
  approved_at timestamptz
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
    FROM public.requests r
    WHERE r.id = p_request_id
      AND (r.requester_id = v_user_id OR r.selected_user_id = v_user_id)
  ) THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    em.id,
    em.position AS milestone_position,
    em.title,
    em.description,
    em.amount_major,
    em.status,
    em.submitted_at,
    em.approved_at
  FROM public.engagement_milestones em
  WHERE em.request_id = p_request_id
  ORDER BY em.position;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_engagement_milestones(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_request_milestone_proposals(p_request_id uuid)
RETURNS TABLE (
  proposal_id uuid,
  response_id uuid,
  status public.milestone_proposal_status,
  items jsonb
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
    FROM public.requests r
    WHERE r.id = p_request_id AND r.requester_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    mp.id,
    mp.response_id,
    mp.status,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'position', i.position,
          'title', i.title,
          'description', i.description,
          'amount', i.amount_major
        )
        ORDER BY i.position
      ) FILTER (WHERE i.id IS NOT NULL),
      '[]'::jsonb
    )
  FROM public.request_milestone_proposals mp
  LEFT JOIN public.request_milestone_proposal_items i ON i.proposal_id = mp.id
  WHERE mp.request_id = p_request_id
    AND mp.status <> 'superseded'::public.milestone_proposal_status
  GROUP BY mp.id, mp.response_id, mp.status
  ORDER BY mp.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_request_milestone_proposals(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.request_milestone_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_milestone_proposal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY request_milestone_proposals_select_participant
  ON public.request_milestone_proposals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.requests r
      WHERE r.id = request_id
        AND (r.requester_id = (SELECT auth.uid()) OR EXISTS (
          SELECT 1
          FROM public.request_responses rr
          WHERE rr.id = response_id AND rr.responder_id = (SELECT auth.uid())
        ))
    )
  );

CREATE POLICY request_milestone_proposal_items_select_participant
  ON public.request_milestone_proposal_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.request_milestone_proposals mp
      JOIN public.requests r ON r.id = mp.request_id
      WHERE mp.id = proposal_id
        AND (
          r.requester_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.request_responses rr
            WHERE rr.id = mp.response_id AND rr.responder_id = (SELECT auth.uid())
          )
        )
    )
  );

CREATE POLICY engagement_milestones_select_participant
  ON public.engagement_milestones
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.requests r
      WHERE r.id = request_id
        AND (r.requester_id = (SELECT auth.uid()) OR r.selected_user_id = (SELECT auth.uid()))
    )
  );

REVOKE ALL ON TABLE public.request_milestone_proposals FROM PUBLIC;
REVOKE ALL ON TABLE public.request_milestone_proposal_items FROM PUBLIC;
REVOKE ALL ON TABLE public.engagement_milestones FROM PUBLIC;
GRANT SELECT ON public.request_milestone_proposals TO authenticated;
GRANT SELECT ON public.request_milestone_proposal_items TO authenticated;
GRANT SELECT ON public.engagement_milestones TO authenticated;
GRANT ALL ON public.request_milestone_proposals TO service_role;
GRANT ALL ON public.request_milestone_proposal_items TO service_role;
GRANT ALL ON public.engagement_milestones TO service_role;