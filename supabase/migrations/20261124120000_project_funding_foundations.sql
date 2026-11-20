-- Project domain and shared funding pool (separate from requests).

ALTER TYPE public.wallet_transaction_type ADD VALUE IF NOT EXISTS 'project_contribution';

CREATE TYPE public.project_visibility AS ENUM (
  'private'
);

COMMENT ON TYPE public.project_visibility IS
  'Interim: private (creator-only read). Public discovery modes await UD-01.';

CREATE TYPE public.project_funding_visibility AS ENUM (
  'invite_only',
  'public'
);

CREATE TYPE public.project_status AS ENUM (
  'draft',
  'live',
  'funding_unsuccessful',
  'cancelled'
);

CREATE TYPE public.project_funding_status AS ENUM (
  'not_open',
  'open',
  'target_met',
  'fully_funded',
  'unsuccessful'
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS premium_trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS premium_trial_ends_at timestamptz;

COMMENT ON COLUMN public.profiles.premium_trial_started_at IS
  'One 30-day Premium trial start (Project creation gate).';
COMMENT ON COLUMN public.profiles.premium_trial_ends_at IS
  'Premium trial expiry; existing Projects remain operable after expiry.';

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS project_id uuid;

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  attachment_path text,
  project_visibility public.project_visibility NOT NULL DEFAULT 'private'::public.project_visibility,
  funding_visibility public.project_funding_visibility NOT NULL,
  budget_total_kobo bigint NOT NULL,
  min_funding_target_kobo bigint NOT NULL,
  min_contribution_kobo bigint NOT NULL,
  funding_deadline_at timestamptz,
  funding_timezone text NOT NULL DEFAULT 'Africa/Lagos',
  funding_opened_at timestamptz,
  status public.project_status NOT NULL DEFAULT 'draft'::public.project_status,
  funding_status public.project_funding_status NOT NULL DEFAULT 'not_open'::public.project_funding_status,
  min_target_reached_at timestamptz,
  fully_funded_at timestamptz,
  funding_unsuccessful_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_title_length CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  CONSTRAINT projects_description_length CHECK (
    description IS NULL
    OR char_length(btrim(description)) BETWEEN 1 AND 5000
  ),
  CONSTRAINT projects_budget_ordering CHECK (
    budget_total_kobo > 0
    AND min_funding_target_kobo > 0
    AND min_contribution_kobo > 0
    AND min_funding_target_kobo <= budget_total_kobo
    AND min_contribution_kobo <= budget_total_kobo
  )
);

CREATE INDEX projects_creator_idx ON public.projects (creator_id, created_at DESC);

CREATE TABLE public.project_tags (
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags (id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);

CREATE TABLE public.project_funding_pools (
  project_id uuid PRIMARY KEY REFERENCES public.projects (id) ON DELETE CASCADE,
  contributed_total_kobo bigint NOT NULL DEFAULT 0,
  reserved_total_kobo bigint NOT NULL DEFAULT 0,
  committed_compensation_kobo bigint NOT NULL DEFAULT 0,
  CONSTRAINT project_funding_pools_contributed_nonneg CHECK (contributed_total_kobo >= 0),
  CONSTRAINT project_funding_pools_reserved_nonneg CHECK (
    reserved_total_kobo >= 0
    AND committed_compensation_kobo >= 0
  )
);

COMMENT ON COLUMN public.project_funding_pools.committed_compensation_kobo IS
  'Accepted assignment compensation (IP-12); budget cannot reduce below this.';

CREATE TABLE public.project_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  contributor_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  amount_kobo bigint NOT NULL,
  wallet_reference text NOT NULL,
  reserved_kobo bigint NOT NULL DEFAULT 0,
  refunded_kobo bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_contributions_amount_positive CHECK (amount_kobo > 0),
  CONSTRAINT project_contributions_reserved_refunded CHECK (
    reserved_kobo >= 0
    AND refunded_kobo >= 0
    AND reserved_kobo + refunded_kobo <= amount_kobo
  ),
  CONSTRAINT project_contributions_wallet_reference_key UNIQUE (wallet_reference)
);

CREATE INDEX project_contributions_project_idx
  ON public.project_contributions (project_id, created_at);

CREATE TABLE public.project_contributor_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_contributor_invitations_unique UNIQUE (project_id, invitee_id)
);

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects (id) ON DELETE SET NULL;

ALTER TABLE public.projects OWNER TO postgres;
ALTER TABLE public.project_tags OWNER TO postgres;
ALTER TABLE public.project_funding_pools OWNER TO postgres;
ALTER TABLE public.project_contributions OWNER TO postgres;
ALTER TABLE public.project_contributor_invitations OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.assert_valid_iana_timezone(p_timezone text)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
BEGIN
  IF p_timezone IS NULL OR btrim(p_timezone) = '' THEN
    RAISE EXCEPTION 'timezone is required' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names tzn WHERE tzn.name = p_timezone
  ) THEN
    RAISE EXCEPTION 'invalid timezone' USING errcode = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_premium_project_creation_entitlement(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.premium_trial_ends_at IS NOT NULL
      AND p.premium_trial_ends_at > now()
  ) THEN
    RAISE EXCEPTION 'premium is required to create projects' USING errcode = '55000';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_premium_trial()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.premium_trial_started_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'premium trial already used' USING errcode = '55000';
  END IF;

  UPDATE public.profiles
  SET premium_trial_started_at = now(),
      premium_trial_ends_at = now() + interval '30 days'
  WHERE id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_funding_period_interval()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT interval '30 days';
$$;

CREATE OR REPLACE FUNCTION public.project_funding_min_period_interval()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT interval '1 day';
$$;

CREATE OR REPLACE FUNCTION public.project_funding_default_period_interval()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT interval '7 days';
$$;

-- Creator local calendar date + optional time override → absolute timestamptz (default 23:59:59 local).
CREATE OR REPLACE FUNCTION public.project_funding_deadline_at(
  p_local_date date,
  p_timezone text DEFAULT 'Africa/Lagos',
  p_local_time time DEFAULT time '23:59:59'
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_local timestamp without time zone;
BEGIN
  PERFORM public.assert_valid_iana_timezone(p_timezone);
  v_local := p_local_date + coalesce(p_local_time, time '23:59:59');
  RETURN v_local AT TIME ZONE p_timezone;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_project_budget_kobo(
  p_budget_total_kobo bigint,
  p_min_funding_target_kobo bigint,
  p_min_contribution_kobo bigint
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
BEGIN
  IF p_budget_total_kobo IS NULL OR p_budget_total_kobo <= 0 THEN
    RAISE EXCEPTION 'total budget must be positive' USING errcode = '22023';
  END IF;
  IF p_min_funding_target_kobo IS NULL OR p_min_funding_target_kobo <= 0 THEN
    RAISE EXCEPTION 'minimum funding target must be positive' USING errcode = '22023';
  END IF;
  IF p_min_contribution_kobo IS NULL OR p_min_contribution_kobo <= 0 THEN
    RAISE EXCEPTION 'minimum contribution must be positive' USING errcode = '22023';
  END IF;
  IF p_min_funding_target_kobo > p_budget_total_kobo THEN
    RAISE EXCEPTION 'minimum funding target cannot exceed total budget' USING errcode = '22023';
  END IF;
  IF p_min_contribution_kobo > p_budget_total_kobo THEN
    RAISE EXCEPTION 'minimum contribution cannot exceed total budget' USING errcode = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.snapshot_project_tags(
  p_project_id uuid,
  p_tag_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  DELETE FROM public.project_tags WHERE project_id = p_project_id;

  IF p_tag_ids IS NULL OR cardinality(p_tag_ids) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.project_tags (project_id, tag_id)
  SELECT p_project_id, t.id
  FROM unnest(p_tag_ids) AS input (tag_id)
  JOIN public.tags t ON t.id = input.tag_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_project_funding_status(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_project public.projects%rowtype;
  v_pool public.project_funding_pools%rowtype;
  v_new_funding public.project_funding_status;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
  END IF;

  IF v_project.funding_status IN (
    'unsuccessful'::public.project_funding_status,
    'fully_funded'::public.project_funding_status
  ) THEN
    RETURN;
  END IF;

  IF v_project.funding_status = 'not_open'::public.project_funding_status THEN
    RETURN;
  END IF;

  SELECT * INTO v_pool FROM public.project_funding_pools WHERE project_id = p_project_id FOR UPDATE;

  IF v_pool.contributed_total_kobo >= v_project.budget_total_kobo THEN
    v_new_funding := 'fully_funded'::public.project_funding_status;
    UPDATE public.projects
    SET funding_status = v_new_funding,
        fully_funded_at = coalesce(fully_funded_at, now()),
        updated_at = now()
    WHERE id = p_project_id;
    RETURN;
  END IF;

  IF v_project.funding_deadline_at IS NOT NULL
     AND now() >= v_project.funding_deadline_at
     AND v_pool.contributed_total_kobo < v_project.min_funding_target_kobo THEN
    UPDATE public.projects
    SET funding_status = 'unsuccessful'::public.project_funding_status,
        status = 'funding_unsuccessful'::public.project_status,
        funding_unsuccessful_at = coalesce(funding_unsuccessful_at, now()),
        updated_at = now()
    WHERE id = p_project_id
      AND funding_status <> 'unsuccessful'::public.project_funding_status;
    RETURN;
  END IF;

  IF v_pool.contributed_total_kobo >= v_project.min_funding_target_kobo THEN
    v_new_funding := CASE
      WHEN v_project.funding_status = 'open'::public.project_funding_status
        THEN 'target_met'::public.project_funding_status
      ELSE v_project.funding_status
    END;

    UPDATE public.projects
    SET funding_status = v_new_funding,
        min_target_reached_at = coalesce(min_target_reached_at, now()),
        updated_at = now()
    WHERE id = p_project_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_project_assignments_allowed(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_project public.projects%rowtype;
  v_pool public.project_funding_pools%rowtype;
BEGIN
  PERFORM public.evaluate_project_funding_status(p_project_id);

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  SELECT * INTO v_pool FROM public.project_funding_pools WHERE project_id = p_project_id;

  IF v_project.funding_status = 'unsuccessful'::public.project_funding_status
     OR v_project.status = 'funding_unsuccessful'::public.project_status THEN
    RAISE EXCEPTION 'project funding was unsuccessful' USING errcode = '55000';
  END IF;

  IF v_pool.contributed_total_kobo < v_project.min_funding_target_kobo THEN
    RAISE EXCEPTION 'minimum funding target has not been reached' USING errcode = '55000';
  END IF;
END;
$$;

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
  p_funding_timezone text DEFAULT 'Africa/Lagos'
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
BEGIN
  PERFORM public.assert_premium_project_creation_entitlement(v_user_id);

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
    'draft'::public.project_status,
    'not_open'::public.project_funding_status
  )
  RETURNING id INTO v_project_id;

  INSERT INTO public.project_funding_pools (project_id) VALUES (v_project_id);

  PERFORM public.snapshot_project_tags(v_project_id, p_tag_ids);

  RETURN v_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_project_funding(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  UPDATE public.projects
  SET status = 'live'::public.project_status,
      funding_status = 'open'::public.project_funding_status,
      funding_opened_at = now(),
      updated_at = now()
  WHERE id = p_project_id
    AND creator_id = v_user_id
    AND status = 'draft'::public.project_status
    AND funding_status = 'not_open'::public.project_funding_status
    AND funding_deadline_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project cannot open funding' USING errcode = '55000';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.shorten_project_funding_deadline(
  p_project_id uuid,
  p_new_deadline_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_project public.projects%rowtype;
BEGIN
  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id AND creator_id = v_user_id
  FOR UPDATE;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
  END IF;

  IF v_project.funding_opened_at IS NULL
     OR v_project.funding_status NOT IN (
       'open'::public.project_funding_status,
       'target_met'::public.project_funding_status
     ) THEN
    RAISE EXCEPTION 'funding is not open' USING errcode = '55000';
  END IF;

  IF p_new_deadline_at >= v_project.funding_deadline_at THEN
    RAISE EXCEPTION 'funding deadline can only be shortened' USING errcode = '55000';
  END IF;

  IF p_new_deadline_at <= now() THEN
    RAISE EXCEPTION 'funding deadline must remain in the future' USING errcode = '55000';
  END IF;

  IF p_new_deadline_at < v_project.funding_opened_at + public.project_funding_min_period_interval() THEN
    RAISE EXCEPTION 'funding deadline is below the minimum period' USING errcode = '55000';
  END IF;

  UPDATE public.projects
  SET funding_deadline_at = p_new_deadline_at,
      updated_at = now()
  WHERE id = p_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increase_project_budget(
  p_project_id uuid,
  p_new_budget_total_major numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_project public.projects%rowtype;
  v_pool public.project_funding_pools%rowtype;
  v_new_budget bigint;
  v_floor bigint;
BEGIN
  v_new_budget := public.ngn_major_to_kobo(p_new_budget_total_major);

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id AND creator_id = v_user_id
  FOR UPDATE;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_pool FROM public.project_funding_pools WHERE project_id = p_project_id FOR UPDATE;

  v_floor := greatest(v_pool.committed_compensation_kobo, v_pool.contributed_total_kobo, v_project.min_funding_target_kobo);

  IF v_new_budget < v_floor THEN
    RAISE EXCEPTION 'budget cannot be reduced below committed or contributed amounts' USING errcode = '55000';
  END IF;

  IF v_new_budget <= v_project.budget_total_kobo THEN
    RAISE EXCEPTION 'new budget must be greater than current budget' USING errcode = '55000';
  END IF;

  PERFORM public.validate_project_budget_kobo(
    v_new_budget,
    v_project.min_funding_target_kobo,
    v_project.min_contribution_kobo
  );

  UPDATE public.projects
  SET budget_total_kobo = v_new_budget,
      updated_at = now()
  WHERE id = p_project_id;

  PERFORM public.evaluate_project_funding_status(p_project_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.decrease_project_budget(
  p_project_id uuid,
  p_new_budget_total_major numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_project public.projects%rowtype;
  v_pool public.project_funding_pools%rowtype;
  v_new_budget bigint;
  v_floor bigint;
BEGIN
  v_new_budget := public.ngn_major_to_kobo(p_new_budget_total_major);

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id AND creator_id = v_user_id
  FOR UPDATE;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_pool FROM public.project_funding_pools WHERE project_id = p_project_id FOR UPDATE;

  v_floor := greatest(
    v_pool.committed_compensation_kobo,
    v_pool.contributed_total_kobo,
    v_project.min_funding_target_kobo
  );

  IF v_new_budget < v_floor THEN
    RAISE EXCEPTION 'budget cannot be reduced below committed or contributed amounts' USING errcode = '55000';
  END IF;

  IF v_new_budget >= v_project.budget_total_kobo THEN
    RAISE EXCEPTION 'new budget must be less than current budget' USING errcode = '55000';
  END IF;

  PERFORM public.validate_project_budget_kobo(
    v_new_budget,
    v_project.min_funding_target_kobo,
    v_project.min_contribution_kobo
  );

  UPDATE public.projects
  SET budget_total_kobo = v_new_budget,
      updated_at = now()
  WHERE id = p_project_id;

  PERFORM public.evaluate_project_funding_status(p_project_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_project_contributor(
  p_project_id uuid,
  p_invitee_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_invite_id uuid;
BEGIN
  IF p_invitee_id IS NULL OR p_invitee_id = v_user_id THEN
    RAISE EXCEPTION 'invalid invitee' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND p.creator_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
  END IF;

  INSERT INTO public.project_contributor_invitations (
    project_id,
    invitee_id,
    invited_by
  )
  VALUES (p_project_id, p_invitee_id, v_user_id)
  ON CONFLICT (project_id, invitee_id) DO UPDATE
  SET invited_by = excluded.invited_by
  RETURNING id INTO v_invite_id;

  RETURN v_invite_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_may_contribute_to_project(
  p_project_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_project public.projects%rowtype;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
  END IF;

  IF v_project.funding_visibility = 'public'::public.project_funding_visibility THEN
    RETURN;
  END IF;

  IF v_project.creator_id = p_user_id THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_contributor_invitations inv
    WHERE inv.project_id = p_project_id
      AND inv.invitee_id = p_user_id
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'you are not invited to contribute to this project' USING errcode = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.contribute_to_project(
  p_project_id uuid,
  p_amount_major numeric,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_project public.projects%rowtype;
  v_pool public.project_funding_pools%rowtype;
  v_amount_kobo bigint;
  v_reference text;
  v_contribution_id uuid;
  v_tx_id uuid;
  v_remaining bigint;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  v_amount_kobo := public.ngn_major_to_kobo(p_amount_major);
  IF v_amount_kobo <= 0 THEN
    RAISE EXCEPTION 'contribution amount must be positive' USING errcode = '22023';
  END IF;

  v_reference := 'project_contribution:' || p_idempotency_key;

  IF EXISTS (
    SELECT 1 FROM public.project_contributions pc WHERE pc.wallet_reference = v_reference
  ) THEN
    RETURN (SELECT pc.id FROM public.project_contributions pc WHERE pc.wallet_reference = v_reference);
  END IF;

  PERFORM public.evaluate_project_funding_status(p_project_id);

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
  END IF;

  PERFORM public.assert_may_contribute_to_project(p_project_id, v_user_id);

  IF v_project.funding_status IN (
    'unsuccessful'::public.project_funding_status,
    'fully_funded'::public.project_funding_status,
    'not_open'::public.project_funding_status
  ) THEN
    RAISE EXCEPTION 'project is not accepting contributions' USING errcode = '55000';
  END IF;

  IF v_project.funding_deadline_at IS NOT NULL AND now() >= v_project.funding_deadline_at THEN
    PERFORM public.evaluate_project_funding_status(p_project_id);
    RAISE EXCEPTION 'funding deadline has passed' USING errcode = '55000';
  END IF;

  IF v_amount_kobo < v_project.min_contribution_kobo THEN
    RAISE EXCEPTION 'contribution is below the minimum' USING errcode = '55000';
  END IF;

  SELECT * INTO v_pool FROM public.project_funding_pools WHERE project_id = p_project_id FOR UPDATE;

  v_remaining := v_project.budget_total_kobo - v_pool.contributed_total_kobo;
  IF v_amount_kobo > v_remaining THEN
    RAISE EXCEPTION 'contribution would exceed the project budget' USING errcode = '55000';
  END IF;

  v_tx_id := public.wallet_debit_available_kobo(
    v_reference,
    v_user_id,
    v_amount_kobo,
    'project_contribution'::public.wallet_transaction_type,
    'Project contribution',
    NULL,
    jsonb_build_object('project_id', p_project_id)
  );

  UPDATE public.wallet_transactions
  SET project_id = p_project_id
  WHERE id = v_tx_id;

  INSERT INTO public.project_contributions (
    project_id,
    contributor_id,
    amount_kobo,
    wallet_reference
  )
  VALUES (p_project_id, v_user_id, v_amount_kobo, v_reference)
  RETURNING id INTO v_contribution_id;

  UPDATE public.project_funding_pools
  SET contributed_total_kobo = contributed_total_kobo + v_amount_kobo
  WHERE project_id = p_project_id;

  PERFORM public.evaluate_project_funding_status(p_project_id);

  RETURN v_contribution_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_project_contribution_refund(p_contribution_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_contribution_id IS NULL THEN
    RAISE EXCEPTION 'contribution id is required' USING errcode = '22023';
  END IF;

  RAISE EXCEPTION
    'contributor refunds are not available until reservation allocation rules are approved (UD-19)'
    USING errcode = 'P0001';
END;
$$;

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
  tag_slugs text[]
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
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
    )
  FROM public.projects p
  JOIN public.project_funding_pools pool ON pool.project_id = p.id
  WHERE p.id = p_project_id
    AND (
      p.creator_id = v_user_id
      OR EXISTS (
        SELECT 1
        FROM public.project_contributions pc
        WHERE pc.project_id = p.id AND pc.contributor_id = v_user_id
      )
      OR (
        p.status = 'live'::public.project_status
        AND (
          p.funding_visibility = 'public'::public.project_funding_visibility
          OR EXISTS (
            SELECT 1
            FROM public.project_contributor_invitations inv
            WHERE inv.project_id = p.id AND inv.invitee_id = v_user_id
          )
        )
      )
    );
END;
$$;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_funding_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_contributor_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tags ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.projects FROM PUBLIC;
REVOKE ALL ON TABLE public.project_funding_pools FROM PUBLIC;
REVOKE ALL ON TABLE public.project_contributions FROM PUBLIC;
REVOKE ALL ON TABLE public.project_contributor_invitations FROM PUBLIC;
REVOKE ALL ON TABLE public.project_tags FROM PUBLIC;

GRANT SELECT ON TABLE public.projects TO service_role;
GRANT SELECT ON TABLE public.project_funding_pools TO service_role;
GRANT SELECT ON TABLE public.project_contributions TO service_role;
GRANT SELECT ON TABLE public.project_contributor_invitations TO service_role;
GRANT SELECT ON TABLE public.project_tags TO service_role;

GRANT EXECUTE ON FUNCTION public.start_premium_trial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_project(
  text, text, text, uuid[], public.project_funding_visibility,
  numeric, numeric, numeric, date, time, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_project_funding(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shorten_project_funding_deadline(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increase_project_budget(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrease_project_budget(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_project_contributor(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contribute_to_project(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_project_contribution_refund(uuid) TO authenticated;