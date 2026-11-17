-- Milestone engagements begin on accept (paidaid: first step active, no separate "start work").

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
      CASE
        WHEN v_item.position = 1 THEN 'in_progress'::public.milestone_status
        ELSE 'pending'::public.milestone_status
      END
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

-- Existing milestone engagements: open step 1 without a helper "start work" tap.
UPDATE public.engagement_milestones em
SET status = 'in_progress'::public.milestone_status
FROM public.requests r
WHERE r.id = em.request_id
  AND r.payment_structure = 'milestone'::public.payment_structure
  AND em.position = 1
  AND em.status = 'pending'::public.milestone_status
  AND r.status IN (
    'accepted'::public.request_status,
    'in_progress'::public.request_status,
    'completion_pending'::public.request_status
  );