-- Universal Worker Start window (24h from acceptance) and creator dismissal for failure to start.

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS start_by_at timestamptz;

COMMENT ON COLUMN public.requests.start_by_at IS
  'Server-set deadline for the selected Worker to press Start (accepted_at + engagement start window).';

CREATE OR REPLACE FUNCTION public.request_engagement_start_window_interval()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT interval '24 hours';
$$;

COMMENT ON FUNCTION public.request_engagement_start_window_interval() IS
  'Worker must Start within this interval after acceptance.';

UPDATE public.requests r
SET start_by_at = r.accepted_at + public.request_engagement_start_window_interval()
WHERE r.accepted_at IS NOT NULL
  AND r.start_by_at IS NULL
  AND r.status = ANY (
    ARRAY[
      'accepted'::public.request_status,
      'in_progress'::public.request_status,
      'completion_pending'::public.request_status
    ]
  );

-- Milestones: do not activate step 1 until Worker Start (reverts auto-begin on accept).
CREATE OR REPLACE FUNCTION public.snapshot_engagement_milestones(
  p_request_id uuid,
  p_proposal_id uuid
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
    SELECT 1 FROM public.engagement_milestones em WHERE em.request_id = p_request_id
  ) THEN
    RAISE EXCEPTION 'milestones already snapshot for this request' USING errcode = '55000';
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.request_milestone_proposal_items i
    WHERE i.proposal_id = p_proposal_id
    ORDER BY i.position
  LOOP
    SELECT * INTO v_charge FROM public.compute_request_charge(v_item.amount_major);

    INSERT INTO public.engagement_milestones (
      request_id,
      proposal_id,
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
      p_request_id,
      p_proposal_id,
      v_item.position,
      v_item.title,
      v_item.description,
      v_item.amount_major,
      public.ngn_major_to_kobo(v_charge.total),
      public.ngn_major_to_kobo(v_charge.provider_amount),
      public.ngn_major_to_kobo(v_charge.service_fee),
      'pending'::public.milestone_status
    );
  END LOOP;

  UPDATE public.request_milestone_proposals
  SET status = 'locked'::public.milestone_proposal_status
  WHERE id = p_proposal_id;

  UPDATE public.request_milestone_proposals
  SET status = 'superseded'::public.milestone_proposal_status
  WHERE request_id = p_request_id
    AND id <> p_proposal_id
    AND status NOT IN (
      'locked'::public.milestone_proposal_status,
      'superseded'::public.milestone_proposal_status
    );
END;
$$;

-- Accepted engagements awaiting Start: milestone #1 should not already be in progress.
UPDATE public.engagement_milestones em
SET status = 'pending'::public.milestone_status
FROM public.requests r
WHERE r.id = em.request_id
  AND r.payment_structure = 'milestone'::public.payment_structure
  AND r.status = 'accepted'::public.request_status
  AND r.started_at IS NULL
  AND em.position = 1
  AND em.status = 'in_progress'::public.milestone_status;

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
  v_accepted_at timestamptz := now();
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
      accepted_at = v_accepted_at,
      start_by_at = v_accepted_at + public.request_engagement_start_window_interval(),
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
  v_accepted_at timestamptz;
  v_start_by_at timestamptz;
  v_started_at timestamptz;
  v_helper_name text;
  v_helper_first text;
  v_first_milestone_id uuid;
BEGIN
  SELECT
    status,
    requester_id,
    payment_structure,
    accepted_at,
    start_by_at,
    started_at
    INTO v_status,
         v_requester_id,
         v_payment_structure,
         v_accepted_at,
         v_start_by_at,
         v_started_at
  FROM public.requests
  WHERE id = p_request_id AND selected_user_id = v_user_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_status = 'in_progress' THEN
    -- Idempotent: do not change started_at
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

  IF v_accepted_at IS NULL THEN
    RAISE EXCEPTION 'acceptance timestamp is missing' USING errcode = '55000';
  END IF;

  v_start_by_at := coalesce(v_start_by_at, v_accepted_at + public.request_engagement_start_window_interval());

  IF now() > v_start_by_at THEN
    RAISE EXCEPTION 'the start window has expired' USING errcode = '55000';
  END IF;

  UPDATE public.requests
  SET status = 'in_progress'::public.request_status,
      started_at = coalesce(started_at, now()),
      start_by_at = v_start_by_at
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

CREATE OR REPLACE FUNCTION public.dismiss_worker_failure_to_start(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_status public.request_status;
  v_payment public.payment_status;
  v_start_by_at timestamptz;
  v_started_at timestamptz;
  v_released_total bigint;
  v_payment_key text;
  v_helper_name text;
  v_helper_first text;
BEGIN
  v_payment_key := 'dismiss_failure_to_start:' || p_request_id::text;

  SELECT r.requester_id, r.selected_user_id, r.status, r.payment_status, r.start_by_at, r.started_at
    INTO v_requester_id, v_selected_user_id, v_status, v_payment, v_start_by_at, v_started_at
  FROM public.requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_requester_id IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_requester_id <> v_user_id THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_status = 'no_show'::public.request_status AND v_payment = 'refunded'::public.payment_status THEN
    RETURN;
  END IF;

  IF v_status = 'completed'::public.request_status THEN
    RAISE EXCEPTION 'a completed request cannot be dismissed' USING errcode = '55000';
  END IF;

  IF v_status = 'no_show'::public.request_status THEN
    RETURN;
  END IF;

  IF v_status <> 'accepted'::public.request_status THEN
    RAISE EXCEPTION 'this request cannot be dismissed for failure to start' USING errcode = '55000';
  END IF;

  IF v_started_at IS NOT NULL OR v_status = 'in_progress'::public.request_status THEN
    RAISE EXCEPTION 'the worker has already started' USING errcode = '55000';
  END IF;

  IF v_start_by_at IS NULL THEN
    RAISE EXCEPTION 'start deadline is not set' USING errcode = '55000';
  END IF;

  IF now() < v_start_by_at THEN
    RAISE EXCEPTION 'the start window has not ended yet' USING errcode = '55000';
  END IF;

  SELECT coalesce(pl.released_total_kobo, 0)
    INTO v_released_total
  FROM public.payment_locks pl
  WHERE pl.request_id = p_request_id;

  IF v_released_total > 0 THEN
    RAISE EXCEPTION 'funds have already been released for this engagement' USING errcode = '55000';
  END IF;

  UPDATE public.request_responses
  SET status = 'declined'::public.response_status,
      resolved_at = coalesce(resolved_at, now())
  WHERE request_id = p_request_id
    AND status = 'accepted'::public.response_status;

  UPDATE public.requests
  SET status = 'no_show'::public.request_status,
      completion_confirm_by = NULL
  WHERE id = p_request_id;

  PERFORM public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'no_show'::public.request_status,
    'dismiss_failure_to_start:' || p_request_id::text
  );

  IF v_payment IN ('locked', 'pending') THEN
    PERFORM public.apply_payment_transition(
      p_request_id,
      'refunded'::public.payment_status,
      v_payment_key
    );
  END IF;

  IF v_selected_user_id IS NOT NULL THEN
    PERFORM public.release_provider(v_selected_user_id);

    SELECT p.display_name INTO v_helper_name
    FROM public.profiles p
    WHERE p.id = v_selected_user_id;

    v_helper_first := coalesce(public.display_first_name(v_helper_name), 'the helper');

    PERFORM public.create_notification(
      v_selected_user_id,
      'request:' || p_request_id::text || ':dismissed_no_start',
      'response_accepted'::public.notification_type,
      'Engagement ended',
      format('%s ended the engagement because work did not start in time.', 'The requester'),
      format('/engagement/%s', p_request_id),
      p_request_id,
      NULL,
      NULL,
      NULL,
      v_requester_id,
      NULL,
      true
    );
  END IF;
END;
$$;

-- Milestone submit requires Worker Start (request in progress).
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
  v_started_at timestamptz;
  v_prior_unpaid integer;
BEGIN
  SELECT em.* INTO v_milestone
  FROM public.engagement_milestones em
  WHERE em.id = p_milestone_id
  FOR UPDATE;

  IF v_milestone.id IS NULL THEN
    RAISE EXCEPTION 'milestone not found' USING errcode = 'P0002';
  END IF;

  SELECT
    r.requester_id,
    r.selected_user_id,
    r.payment_structure,
    r.status,
    r.payment_status,
    r.started_at
    INTO v_requester_id,
         v_selected_user_id,
         v_payment_structure,
         v_request_status,
         v_payment,
         v_started_at
  FROM public.requests r
  WHERE r.id = v_milestone.request_id
  FOR UPDATE;

  IF v_requester_id IS NULL OR v_payment_structure <> 'milestone'::public.payment_structure THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_request_status <> 'in_progress'::public.request_status OR v_started_at IS NULL THEN
    RAISE EXCEPTION 'the worker must start before submitting milestones' USING errcode = '55000';
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

REVOKE ALL ON FUNCTION public.dismiss_worker_failure_to_start(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_worker_failure_to_start(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_worker_failure_to_start(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.request_engagement_start_window_interval() TO authenticated, service_role;