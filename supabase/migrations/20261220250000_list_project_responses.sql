-- Creator/contributor project responses list (ResponseCard-shaped, excludes cancelled).

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
  responder_available boolean
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
    true
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