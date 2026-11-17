-- Milestone payment RPCs and single-payment guards.

-- ---------------------------------------------------------------------------
-- Internal: snapshot milestones at accept
-- ---------------------------------------------------------------------------

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

REVOKE ALL ON FUNCTION public.snapshot_engagement_milestones(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.snapshot_engagement_milestones(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_milestone_proposal_for_accept(
  p_request_id uuid,
  p_response_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_proposal_id uuid;
BEGIN
  SELECT mp.id INTO v_proposal_id
  FROM public.request_milestone_proposals mp
  WHERE mp.response_id = p_response_id
    AND mp.status = 'requester_agreed'::public.milestone_proposal_status;

  IF v_proposal_id IS NOT NULL THEN
    RETURN v_proposal_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.request_milestone_proposals mp
    WHERE mp.response_id = p_response_id
      AND mp.status = 'proposed'::public.milestone_proposal_status
  ) THEN
    RAISE EXCEPTION 'milestone proposal must be agreed before accept' USING errcode = '55000';
  END IF;

  SELECT mp.id INTO v_proposal_id
  FROM public.request_milestone_proposals mp
  WHERE mp.request_id = p_request_id
    AND mp.response_id IS NULL
    AND mp.status = 'draft'::public.milestone_proposal_status;

  IF v_proposal_id IS NULL THEN
    RAISE EXCEPTION 'milestone request has no agreed plan' USING errcode = '55000';
  END IF;

  RETURN v_proposal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_milestone_proposal_for_accept(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_milestone_proposal_for_accept(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.validate_proposal_matches_total(
  p_proposal_id uuid,
  p_total_major numeric
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_sum numeric;
BEGIN
  SELECT coalesce(sum(i.amount_major), 0)
    INTO v_sum
  FROM public.request_milestone_proposal_items i
  WHERE i.proposal_id = p_proposal_id;

  IF v_sum <> p_total_major THEN
    RAISE EXCEPTION 'milestone amounts must equal the agreed offer' USING errcode = '22023';
  END IF;

  IF (
    SELECT count(*)::int
    FROM public.request_milestone_proposal_items i
    WHERE i.proposal_id = p_proposal_id
  ) < 2 THEN
    RAISE EXCEPTION 'milestone plan must have at least 2 milestones' USING errcode = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_proposal_matches_total(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_proposal_matches_total(uuid, numeric) TO service_role;

-- ---------------------------------------------------------------------------
-- Milestone completion (no completion_pending path)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_milestone_engagement(
  p_request_id uuid,
  p_actor_id uuid,
  p_status_event_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_status public.request_status;
  v_selected_user_id uuid;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_requester_name text;
  v_requester_first text;
  v_unpaid integer;
BEGIN
  IF p_status_event_key IS NULL OR btrim(p_status_event_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  SELECT r.status, r.selected_user_id, r.requester_id, r.payment_status
    INTO v_status, v_selected_user_id, v_requester_id, v_payment
  FROM public.requests r
  WHERE r.id = p_request_id
    AND r.payment_structure = 'milestone'::public.payment_structure
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_status = 'completed' THEN
    RETURN false;
  END IF;

  IF v_payment = 'disputed'::public.payment_status THEN
    RETURN false;
  END IF;

  SELECT count(*)::int INTO v_unpaid
  FROM public.engagement_milestones em
  WHERE em.request_id = p_request_id
    AND em.status <> 'approved_paid'::public.milestone_status;

  IF v_unpaid <> 0 THEN
    RAISE EXCEPTION 'not all milestones are paid' USING errcode = '55000';
  END IF;

  UPDATE public.requests
  SET status = 'completed'::public.request_status,
      completed_at = now(),
      started_at = coalesce(started_at, now()),
      completion_confirm_by = NULL
  WHERE id = p_request_id;

  PERFORM public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_status,
    'completed'::public.request_status,
    p_status_event_key
  );

  IF v_payment = 'pending' THEN
    PERFORM public.apply_payment_transition(
      p_request_id,
      'released'::public.payment_status,
      'milestone_complete:' || p_request_id::text
    );
  END IF;

  IF v_selected_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET jobs_completed = jobs_completed + 1
    WHERE id = v_selected_user_id;

    PERFORM public.release_provider(v_selected_user_id);
  END IF;

  UPDATE public.profiles
  SET requests_completed = requests_completed + 1
  WHERE id = v_requester_id;

  IF v_selected_user_id IS NOT NULL THEN
    SELECT p.display_name INTO v_requester_name
    FROM public.profiles p
    WHERE p.id = v_requester_id;

    v_requester_first := coalesce(public.display_first_name(v_requester_name), 'The requester');

    PERFORM public.create_notification(
      v_selected_user_id,
      'milestone_complete:' || p_request_id::text || ':payment_received',
      'payment_received'::public.notification_type,
      'All milestones paid',
      format('%s approved the final milestone. Your engagement is complete.', v_requester_first),
      format('/engagement/%s', p_request_id),
      p_request_id,
      NULL,
      NULL,
      NULL,
      v_requester_id,
      jsonb_build_object('milestone_engagement', true),
      true
    );
  END IF;

  PERFORM public.create_notification(
    v_requester_id,
    'request:' || p_request_id::text || ':rate_experience',
    'rate_experience'::public.notification_type,
    'Leave a rating',
    'This request is complete. Share how it went.',
    format('/rate/%s', p_request_id),
    p_request_id,
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object('completion_event_key', p_status_event_key),
    true
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_milestone_engagement(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_milestone_engagement(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- create_request (optional milestones; backward compatible defaults)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_request(
  p_title text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_scheduled_for timestamp with time zone DEFAULT NULL,
  p_offered_amount numeric DEFAULT NULL,
  p_source_request_id uuid DEFAULT NULL,
  p_attachment_path text DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT '{}'::uuid[],
  p_payment_structure public.payment_structure DEFAULT 'single',
  p_milestones jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_location extensions.geography := public.assert_coordinates(p_latitude, p_longitude);
  v_description text := nullif(btrim(p_description), '');
  v_request_id uuid;
  v_source public.requests%rowtype;
  v_proposal_id uuid;
BEGIN
  IF char_length(btrim(p_title)) < 3 OR char_length(btrim(p_title)) > 120 THEN
    RAISE EXCEPTION 'title must be between 3 and 120 characters' USING errcode = '22023';
  END IF;

  IF v_description IS NOT NULL
     AND (char_length(v_description) < 1 OR char_length(v_description) > 1000) THEN
    RAISE EXCEPTION 'description must be between 1 and 1000 characters' USING errcode = '22023';
  END IF;

  IF p_offered_amount IS NULL OR p_offered_amount <= 0 THEN
    RAISE EXCEPTION 'offer amount must be greater than zero' USING errcode = '22023';
  END IF;

  IF p_payment_structure = 'milestone'::public.payment_structure THEN
    IF p_milestones IS NULL THEN
      RAISE EXCEPTION 'milestone requests require milestones' USING errcode = '22023';
    END IF;
    IF NOT public.milestone_items_sum_matches_total(p_milestones, p_offered_amount) THEN
      RAISE EXCEPTION 'milestone amounts must equal the offer total' USING errcode = '22023';
    END IF;
  ELSIF p_milestones IS NOT NULL THEN
    RAISE EXCEPTION 'milestones are only allowed for milestone payment structure' USING errcode = '22023';
  END IF;

  IF p_scheduled_for IS NOT NULL AND p_scheduled_for < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'scheduled time is in the past' USING errcode = '22023';
  END IF;

  IF p_scheduled_for IS NOT NULL AND p_scheduled_for > now() + interval '30 days' THEN
    RAISE EXCEPTION 'scheduled time is too far in the future' USING errcode = '22023';
  END IF;

  IF p_attachment_path IS NOT NULL THEN
    IF split_part(p_attachment_path, '/', 1) <> v_user_id::text
       OR split_part(p_attachment_path, '/', 2) <> 'drafts' THEN
      RAISE EXCEPTION 'invalid attachment path' USING errcode = '22023';
    END IF;
  END IF;

  IF p_source_request_id IS NOT NULL THEN
    SELECT * INTO v_source
    FROM public.requests
    WHERE id = p_source_request_id AND requester_id = v_user_id;

    IF v_source.id IS NULL THEN
      RAISE EXCEPTION 'source request not found' USING errcode = 'P0002';
    END IF;

    IF NOT (
      v_source.status = 'completed'
      OR v_source.status = 'expired'
    ) THEN
      RAISE EXCEPTION 'only expired or completed requests can be reused' USING errcode = '55000';
    END IF;
  END IF;

  IF (
    SELECT count(*) FROM public.requests
    WHERE requester_id = v_user_id
      AND (
        status IN ('accepted', 'in_progress', 'completion_pending')
        OR (status = 'posted' AND expires_at > now())
      )
  ) >= 5 THEN
    RAISE EXCEPTION 'you already have 5 open requests' USING errcode = '55000';
  END IF;

  PERFORM public.ensure_wallet_account(v_user_id);

  INSERT INTO public.requests (
    requester_id,
    title,
    description,
    scheduled_for,
    offered_amount,
    payment_status,
    payment_structure,
    location,
    location_label,
    status,
    submitted_at,
    expires_at,
    source_request_id,
    attachment_path
  )
  VALUES (
    v_user_id,
    btrim(p_title),
    v_description,
    p_scheduled_for,
    p_offered_amount,
    'not_required'::public.payment_status,
    p_payment_structure,
    v_location,
    btrim(p_location_label),
    'posted',
    now(),
    public.request_expires_at(p_scheduled_for),
    p_source_request_id,
    p_attachment_path
  )
  RETURNING id INTO v_request_id;

  PERFORM public.attach_tags_to_request(v_request_id, p_tag_ids);

  IF p_payment_structure = 'milestone'::public.payment_structure THEN
    INSERT INTO public.request_milestone_proposals (request_id, response_id, status)
    VALUES (v_request_id, NULL, 'draft'::public.milestone_proposal_status)
    RETURNING id INTO v_proposal_id;

    PERFORM public.replace_milestone_proposal_items(v_proposal_id, p_milestones);
  END IF;

  PERFORM public.notify_tag_interest_subscribers(v_request_id);

  RETURN v_request_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Negotiation RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_request_milestone_draft(
  p_request_id uuid,
  p_milestones jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_request public.requests%rowtype;
  v_proposal_id uuid;
BEGIN
  SELECT * INTO v_request
  FROM public.requests r
  WHERE r.id = p_request_id AND r.requester_id = v_user_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_request.payment_structure <> 'milestone'::public.payment_structure THEN
    RAISE EXCEPTION 'only milestone requests support milestone drafts' USING errcode = '55000';
  END IF;

  IF v_request.status NOT IN ('posted'::public.request_status, 'awaiting_review'::public.request_status) THEN
    RAISE EXCEPTION 'this request can no longer be edited' USING errcode = '55000';
  END IF;

  IF NOT public.milestone_items_sum_matches_total(p_milestones, v_request.offered_amount) THEN
    RAISE EXCEPTION 'milestone amounts must equal the offer total' USING errcode = '22023';
  END IF;

  SELECT mp.id INTO v_proposal_id
  FROM public.request_milestone_proposals mp
  WHERE mp.request_id = p_request_id
    AND mp.response_id IS NULL
    AND mp.status = 'draft'::public.milestone_proposal_status;

  IF v_proposal_id IS NULL THEN
    INSERT INTO public.request_milestone_proposals (request_id, response_id, status)
    VALUES (p_request_id, NULL, 'draft'::public.milestone_proposal_status)
    RETURNING id INTO v_proposal_id;
  END IF;

  PERFORM public.replace_milestone_proposal_items(v_proposal_id, p_milestones);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_request_milestone_draft(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_response_milestone_proposal(
  p_response_id uuid,
  p_milestones jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_response public.request_responses%rowtype;
  v_request public.requests%rowtype;
  v_target_total numeric;
  v_proposal_id uuid;
BEGIN
  SELECT * INTO v_response
  FROM public.request_responses rr
  WHERE rr.id = p_response_id AND rr.responder_id = v_user_id
  FOR UPDATE;

  IF v_response.id IS NULL THEN
    RAISE EXCEPTION 'response not found' USING errcode = 'P0002';
  END IF;

  IF v_response.status <> 'pending'::public.response_status THEN
    RAISE EXCEPTION 'response is no longer editable' USING errcode = '55000';
  END IF;

  SELECT * INTO v_request
  FROM public.requests r
  WHERE r.id = v_response.request_id
  FOR UPDATE;

  IF v_request.payment_structure <> 'milestone'::public.payment_structure THEN
    RAISE EXCEPTION 'this request does not use milestone payments' USING errcode = '55000';
  END IF;

  v_target_total := coalesce(nullif(v_response.quoted_amount, 0), v_request.offered_amount);

  IF NOT public.milestone_items_sum_matches_total(p_milestones, v_target_total) THEN
    RAISE EXCEPTION 'milestone amounts must equal the agreed offer total' USING errcode = '22023';
  END IF;

  UPDATE public.request_milestone_proposals
  SET status = 'superseded'::public.milestone_proposal_status
  WHERE response_id = p_response_id
    AND status IN (
      'proposed'::public.milestone_proposal_status,
      'requester_agreed'::public.milestone_proposal_status
    );

  INSERT INTO public.request_milestone_proposals (request_id, response_id, status)
  VALUES (v_request.id, p_response_id, 'proposed'::public.milestone_proposal_status)
  RETURNING id INTO v_proposal_id;

  PERFORM public.replace_milestone_proposal_items(v_proposal_id, p_milestones);

  RETURN v_proposal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_response_milestone_proposal(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.agree_to_response_milestone_proposal(p_response_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_response public.request_responses%rowtype;
  v_request public.requests%rowtype;
  v_proposal_id uuid;
  v_target_total numeric;
BEGIN
  SELECT rr.*
    INTO v_response
  FROM public.request_responses rr
  JOIN public.requests r ON r.id = rr.request_id
  WHERE rr.id = p_response_id AND r.requester_id = v_user_id
  FOR UPDATE OF rr;

  IF v_response.id IS NULL THEN
    RAISE EXCEPTION 'response not found' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_request
  FROM public.requests r
  WHERE r.id = v_response.request_id
  FOR UPDATE;

  IF v_request.payment_structure <> 'milestone'::public.payment_structure THEN
    RAISE EXCEPTION 'this request does not use milestone payments' USING errcode = '55000';
  END IF;

  SELECT mp.id INTO v_proposal_id
  FROM public.request_milestone_proposals mp
  WHERE mp.response_id = p_response_id
    AND mp.status = 'proposed'::public.milestone_proposal_status
  FOR UPDATE;

  IF v_proposal_id IS NULL THEN
    RAISE EXCEPTION 'no milestone proposal to agree to' USING errcode = 'P0002';
  END IF;

  v_target_total := coalesce(nullif(v_response.quoted_amount, 0), v_request.offered_amount);
  PERFORM public.validate_proposal_matches_total(v_proposal_id, v_target_total);

  UPDATE public.request_milestone_proposals
  SET status = 'requester_agreed'::public.milestone_proposal_status
  WHERE id = v_proposal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.agree_to_response_milestone_proposal(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_request(
  text, text, double precision, double precision, text, timestamp with time zone,
  numeric, uuid, text, uuid[], public.payment_structure, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_request(
  text, text, double precision, double precision, text, timestamp with time zone,
  numeric, uuid, text, uuid[], public.payment_structure, jsonb
) TO authenticated;
GRANT ALL ON FUNCTION public.create_request(
  text, text, double precision, double precision, text, timestamp with time zone,
  numeric, uuid, text, uuid[], public.payment_structure, jsonb
) TO service_role;