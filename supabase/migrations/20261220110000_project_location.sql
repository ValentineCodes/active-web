-- Project coarse location (parity with requests); expose on get_project / create_project.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS location extensions.geography(Point, 4326),
  ADD COLUMN IF NOT EXISTS location_label text;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_location_label_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_location_label_check CHECK (
    location_label IS NULL
    OR (
      char_length(btrim(location_label)) >= 2
      AND char_length(btrim(location_label)) <= 120
    )
  );

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
    funding_status
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
    'draft'::public.project_status,
    'not_open'::public.project_funding_status
  )
  RETURNING id INTO v_project_id;

  INSERT INTO public.project_funding_pools (project_id) VALUES (v_project_id);

  PERFORM public.snapshot_project_tags(v_project_id, p_tag_ids);

  RETURN v_project_id;
END;
$$;

DROP FUNCTION IF EXISTS public.get_project(uuid);

CREATE OR REPLACE FUNCTION public.get_project(p_project_id uuid)
RETURNS TABLE(
  project_id uuid,
  creator_id uuid,
  title text,
  description text,
  attachment_path text,
  project_visibility public.project_visibility,
  funding_visibility public.project_funding_visibility,
  budget_total_kobo bigint,
  min_funding_target_kobo bigint,
  min_contribution_kobo bigint,
  funding_deadline_at timestamptz,
  funding_timezone text,
  funding_opened_at timestamptz,
  status public.project_status,
  funding_status public.project_funding_status,
  min_target_reached_at timestamptz,
  fully_funded_at timestamptz,
  funding_unsuccessful_at timestamptz,
  contributed_total_kobo bigint,
  reserved_total_kobo bigint,
  committed_compensation_kobo bigint,
  viewer_is_creator boolean,
  tag_slugs text[],
  location_label text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  PERFORM public.assert_may_view_project(p_project_id, v_user_id);
  PERFORM public.evaluate_project_funding_status(p_project_id);

  RETURN QUERY
  SELECT
    p.id,
    p.creator_id,
    p.title,
    p.description,
    p.attachment_path,
    p.project_visibility,
    p.funding_visibility,
    p.budget_total_kobo,
    p.min_funding_target_kobo,
    p.min_contribution_kobo,
    p.funding_deadline_at,
    p.funding_timezone,
    p.funding_opened_at,
    p.status,
    p.funding_status,
    p.min_target_reached_at,
    p.fully_funded_at,
    p.funding_unsuccessful_at,
    pool.contributed_total_kobo,
    pool.reserved_total_kobo,
    pool.committed_compensation_kobo,
    p.creator_id = v_user_id,
    coalesce(
      (
        SELECT array_agg(t.slug ORDER BY t.slug)
        FROM public.project_tags pt
        JOIN public.tags t ON t.id = pt.tag_id
        WHERE pt.project_id = p.id
      ),
      '{}'::text[]
    ),
    p.location_label
  FROM public.projects p
  JOIN public.project_funding_pools pool ON pool.project_id = p.id
  WHERE p.id = p_project_id;
END;
$$;

DROP FUNCTION IF EXISTS public.create_project(
  text, text, text, uuid[], public.project_funding_visibility,
  numeric, numeric, numeric, date, time, text
);

GRANT EXECUTE ON FUNCTION public.create_project(
  text, text, text, uuid[], public.project_funding_visibility,
  numeric, numeric, numeric, date, time, text,
  double precision, double precision, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_project(uuid) TO authenticated;