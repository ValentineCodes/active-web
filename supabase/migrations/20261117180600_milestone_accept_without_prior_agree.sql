-- Choosing a helper with a counter-proposal implicitly agrees to their milestone plan.

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
    AND mp.status = ANY (
      ARRAY[
        'requester_agreed'::public.milestone_proposal_status,
        'proposed'::public.milestone_proposal_status
      ]
    )
  ORDER BY CASE mp.status
    WHEN 'requester_agreed'::public.milestone_proposal_status THEN 0
    WHEN 'proposed'::public.milestone_proposal_status THEN 1
  END
  LIMIT 1;

  IF v_proposal_id IS NOT NULL THEN
    RETURN v_proposal_id;
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