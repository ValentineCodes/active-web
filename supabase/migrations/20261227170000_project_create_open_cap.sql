-- Cap creators at five concurrent open projects (parity with open requests).

CREATE OR REPLACE FUNCTION public.create_project(
  p_title text,
  p_description text DEFAULT NULL,
  p_attachment_path text DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT '{}'::uuid[],
  p_funding_visibility public.project_funding_visibility DEFAULT 'invite_only'::public.project_funding_visibility,
  p_budget_total_major numeric DEFAULT NULL,
  p_min_funding_target_major numeric DEFAULT NULL,
  p_min_contribution_major numeric DEFAULT NULL,
  p_funding_deadline_local_date date DEFAULT NULL,
  p_funding_deadline_local_time time DEFAULT NULL,
  p_funding_timezone text DEFAULT 'Africa/Lagos',
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_location_label text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_project_id uuid;
  v_budget bigint;
  v_min_target bigint;
  v_min_contribution bigint;
  v_deadline timestamptz;
  v_location extensions.geography;
  v_location_label text;
BEGIN
  PERFORM public.assert_premium_project_creation_entitlement(v_user_id);

  IF p_latitude IS NULL OR p_longitude IS NULL THEN
    RAISE EXCEPTION 'project location coordinates are required' USING errcode = '22023';
  END IF;

  v_location_label := nullif(btrim(p_location_label), '');
  IF v_location_label IS NULL THEN
    RAISE EXCEPTION 'project location label is required' USING errcode = '22023';
  END IF;

  v_location := public.assert_coordinates(p_latitude, p_longitude);

  v_budget := public.ngn_major_to_kobo(p_budget_total_major);
  v_min_target := public.ngn_major_to_kobo(p_min_funding_target_major);
  v_min_contribution := public.ngn_major_to_kobo(p_min_contribution_major);
  PERFORM public.validate_project_budget_kobo(v_budget, v_min_target, v_min_contribution);

  IF p_funding_deadline_local_date IS NULL THEN
    RAISE EXCEPTION 'funding deadline date is required' USING errcode = '22023';
  END IF;

  v_deadline := public.project_funding_deadline_at(
    p_funding_deadline_local_date,
    p_funding_timezone,
    p_funding_deadline_local_time
  );

  IF v_deadline <= now() THEN
    RAISE EXCEPTION 'funding deadline must be in the future' USING errcode = '55000';
  END IF;

  IF v_deadline > now() + public.project_funding_period_interval() THEN
    RAISE EXCEPTION 'funding deadline exceeds the maximum period' USING errcode = '55000';
  END IF;

  IF v_deadline < now() + public.project_funding_min_period_interval() THEN
    RAISE EXCEPTION 'funding deadline is below the minimum period' USING errcode = '55000';
  END IF;

  IF (
    SELECT count(*) FROM public.projects
    WHERE creator_id = v_user_id
      AND status IN (
        'draft'::public.project_status,
        'live'::public.project_status
      )
  ) >= 5 THEN
    RAISE EXCEPTION 'you already have 5 open projects' USING errcode = '55000';
  END IF;

  INSERT INTO public.projects (
    creator_id,
    title,
    description,
    attachment_path,
    funding_visibility,
    budget_total_kobo,
    min_funding_target_kobo,
    min_contribution_kobo,
    funding_deadline_at,
    funding_timezone,
    location,
    location_label,
    status,
    funding_status,
    funding_opened_at
  )
  VALUES (
    v_user_id,
    btrim(p_title),
    nullif(btrim(p_description), ''),
    p_attachment_path,
    p_funding_visibility,
    v_budget,
    v_min_target,
    v_min_contribution,
    v_deadline,
    p_funding_timezone,
    v_location,
    v_location_label,
    'live'::public.project_status,
    'open'::public.project_funding_status,
    now()
  )
  RETURNING id INTO v_project_id;

  INSERT INTO public.project_funding_pools (project_id) VALUES (v_project_id);

  PERFORM public.snapshot_project_tags(v_project_id, p_tag_ids);

  RETURN v_project_id;
END;
$$;