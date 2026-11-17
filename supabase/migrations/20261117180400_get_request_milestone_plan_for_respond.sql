-- Read-only milestone plan for responders and requesters (pre-accept discovery + negotiation UI).

CREATE OR REPLACE FUNCTION public.get_request_milestone_plan_for_respond(p_request_id uuid)
RETURNS TABLE (
  payment_structure public.payment_structure,
  milestones jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_structure public.payment_structure;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.requests r
    WHERE r.id = p_request_id
      AND (
        r.requester_id = v_user_id
        OR EXISTS (
          SELECT 1
          FROM public.request_responses rr
          WHERE rr.request_id = r.id AND rr.responder_id = v_user_id
        )
        OR (
          r.status = 'posted'::public.request_status
          AND r.expires_at > now()
          AND r.offered_amount IS NOT NULL
          AND r.offered_amount > 0
          AND r.payment_status IN (
            'not_required'::public.payment_status,
            'locked'::public.payment_status
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  SELECT r.payment_structure INTO v_structure
  FROM public.requests r
  WHERE r.id = p_request_id;

  payment_structure := v_structure;

  IF v_structure <> 'milestone'::public.payment_structure THEN
    milestones := '[]'::jsonb;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'position', i.position,
        'title', i.title,
        'description', i.description,
        'amount', i.amount_major
      )
      ORDER BY i.position
    ),
    '[]'::jsonb
  )
  INTO milestones
  FROM public.request_milestone_proposals mp
  JOIN public.request_milestone_proposal_items i ON i.proposal_id = mp.id
  WHERE mp.request_id = p_request_id
    AND mp.response_id IS NULL
    AND mp.status = 'draft'::public.milestone_proposal_status;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_request_milestone_plan_for_respond(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_request_milestone_plan_for_respond(uuid) TO authenticated;