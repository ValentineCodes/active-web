-- Phase 9: usernames, public profiles, search RPCs, Premium reads, Crown foundations (no auto points).

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username extensions.citext;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key
  ON public.profiles (lower(username::text))
  WHERE username IS NOT NULL;

COMMENT ON COLUMN public.profiles.username IS
  'Public handle. Mutable only via set_username(); not client-writable.';

CREATE TABLE IF NOT EXISTS public.user_reputation (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  points_main integer NOT NULL DEFAULT 0,
  shield_remaining integer NOT NULL DEFAULT 0,
  crown_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_reputation_points_nonneg CHECK (points_main >= 0),
  CONSTRAINT user_reputation_shield_nonneg CHECK (shield_remaining >= 0)
);

CREATE TABLE IF NOT EXISTS public.reputation_config (
  key text PRIMARY KEY,
  value_json jsonb NOT NULL
);

INSERT INTO public.reputation_config (key, value_json)
VALUES
  ('crown_threshold_bronze', '3'::jsonb),
  ('crown_threshold_silver', '10'::jsonb),
  ('crown_threshold_diamond', '25'::jsonb),
  ('crown_threshold_gold', '50'::jsonb),
  ('gold_shield_capacity', '10'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.reputation_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  delta_main integer NOT NULL DEFAULT 0,
  delta_shield integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'admin',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reputation_ledger_reason_length CHECK (char_length(btrim(reason)) >= 1)
);

CREATE INDEX reputation_ledger_user_idx
  ON public.reputation_ledger (user_id, created_at DESC);

ALTER TABLE public.user_reputation OWNER TO postgres;
ALTER TABLE public.reputation_config OWNER TO postgres;
ALTER TABLE public.reputation_ledger OWNER TO postgres;

ALTER TABLE public.user_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_reputation FROM PUBLIC;
REVOKE ALL ON TABLE public.reputation_config FROM PUBLIC;
REVOKE ALL ON TABLE public.reputation_ledger FROM PUBLIC;

GRANT SELECT ON TABLE public.user_reputation TO service_role;
GRANT SELECT ON TABLE public.reputation_config TO service_role;
GRANT SELECT ON TABLE public.reputation_ledger TO service_role;

CREATE OR REPLACE FUNCTION public.guard_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.phone IS DISTINCT FROM OLD.phone
       OR NEW.avatar_path IS DISTINCT FROM OLD.avatar_path
       OR NEW.avatar_captured_in_app IS DISTINCT FROM OLD.avatar_captured_in_app
       OR NEW.rating_average IS DISTINCT FROM OLD.rating_average
       OR NEW.rating_count IS DISTINCT FROM OLD.rating_count
       OR NEW.jobs_completed IS DISTINCT FROM OLD.jobs_completed
       OR NEW.requests_completed IS DISTINCT FROM OLD.requests_completed
       OR NEW.username IS DISTINCT FROM OLD.username
       OR NEW.premium_trial_started_at IS DISTINCT FROM OLD.premium_trial_started_at
       OR NEW.premium_trial_ends_at IS DISTINCT FROM OLD.premium_trial_ends_at THEN
      RAISE EXCEPTION 'profile field is server managed and cannot be set by a client'
        USING errcode = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_username(p_username text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v text := lower(btrim(coalesce(p_username, '')));
BEGIN
  IF v = '' THEN
    RAISE EXCEPTION 'username is required' USING errcode = '22023';
  END IF;

  IF char_length(v) < 3 OR char_length(v) > 30 THEN
    RAISE EXCEPTION 'username must be between 3 and 30 characters' USING errcode = '22023';
  END IF;

  IF v !~ '^[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'username may only contain letters, numbers, and underscores' USING errcode = '22023';
  END IF;

  IF v IN ('admin', 'support', 'active', 'help', 'root', 'system') THEN
    RAISE EXCEPTION 'username is not available' USING errcode = '55000';
  END IF;

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_reputation_row(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.user_reputation (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.reputation_config_int(p_key text, p_default integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    (
      SELECT (c.value_json #>> '{}')::integer
      FROM public.reputation_config c
      WHERE c.key = p_key
    ),
    p_default
  );
$$;

CREATE OR REPLACE FUNCTION public.crown_tier_for_points(p_points integer)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_gold integer := public.reputation_config_int('crown_threshold_gold', 50);
  v_diamond integer := public.reputation_config_int('crown_threshold_diamond', 25);
  v_silver integer := public.reputation_config_int('crown_threshold_silver', 10);
  v_bronze integer := public.reputation_config_int('crown_threshold_bronze', 3);
BEGIN
  IF p_points >= v_gold THEN
    RETURN 'gold';
  ELSIF p_points >= v_diamond THEN
    RETURN 'diamond';
  ELSIF p_points >= v_silver THEN
    RETURN 'silver';
  ELSIF p_points >= v_bronze THEN
    RETURN 'bronze';
  END IF;

  RETURN 'none';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_username(p_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_normalized text := public.normalize_username(p_username);
BEGIN
  UPDATE public.profiles
  SET username = v_normalized::extensions.citext,
      updated_at = now()
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING errcode = 'P0002';
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'username is already taken' USING errcode = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_profile(p_username text)
RETURNS TABLE(
  user_id uuid,
  username text,
  display_name text,
  bio text,
  avatar_path text,
  rating_average numeric,
  rating_count integer,
  jobs_completed integer,
  requests_completed integer,
  identity_verified boolean,
  crown_tier text,
  points_main integer,
  shield_remaining integer,
  crown_public boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_normalized text := lower(btrim(coalesce(p_username, '')));
  v_viewer uuid := public.assert_authenticated();
  v_row public.profiles%rowtype;
  v_rep public.user_reputation%rowtype;
BEGIN
  IF v_normalized = '' OR v_normalized !~ '^[a-z0-9_]+$' THEN
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.profiles p
  WHERE lower(p.username::text) = v_normalized;

  IF v_row.id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.ensure_user_reputation_row(v_row.id);
  SELECT * INTO v_rep FROM public.user_reputation ur WHERE ur.user_id = v_row.id;

  RETURN QUERY
  SELECT
    v_row.id,
    v_row.username::text,
    v_row.display_name,
    v_row.bio,
    v_row.avatar_path,
    v_row.rating_average,
    v_row.rating_count,
    v_row.jobs_completed,
    v_row.requests_completed,
    public.user_marketplace_identity_verified(v_row.id),
    CASE
      WHEN v_rep.crown_public OR v_row.id = v_viewer
        THEN public.crown_tier_for_points(v_rep.points_main)
      ELSE 'hidden'::text
    END,
    CASE WHEN v_rep.crown_public OR v_row.id = v_viewer THEN v_rep.points_main ELSE NULL END,
    CASE WHEN v_rep.crown_public OR v_row.id = v_viewer THEN v_rep.shield_remaining ELSE NULL END,
    v_rep.crown_public;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_people(
  p_query text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  user_id uuid,
  username text,
  display_name text,
  bio text,
  avatar_path text,
  rating_average numeric,
  rating_count integer,
  identity_verified boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := LEAST(GREATEST(coalesce(p_limit, 20), 1), 50);
  v_offset integer := GREATEST(coalesce(p_offset, 0), 0);
BEGIN
  PERFORM public.assert_authenticated();

  IF v_q = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.username::text,
    p.display_name,
    p.bio,
    p.avatar_path,
    p.rating_average,
    p.rating_count,
    public.user_marketplace_identity_verified(p.id)
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND p.display_name IS NOT NULL
    AND (
      lower(p.username::text) LIKE '%' || v_q || '%'
      OR lower(coalesce(p.display_name, '')) LIKE '%' || v_q || '%'
      OR lower(coalesce(p.bio, '')) LIKE '%' || v_q || '%'
    )
  ORDER BY p.username
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_projects(
  p_query text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  project_id uuid,
  title text,
  description text,
  funding_status public.project_funding_status,
  funding_visibility public.project_funding_visibility,
  budget_total_kobo bigint,
  min_funding_target_kobo bigint,
  funding_deadline_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := LEAST(GREATEST(coalesce(p_limit, 20), 1), 50);
  v_offset integer := GREATEST(coalesce(p_offset, 0), 0);
BEGIN
  PERFORM public.assert_authenticated();

  IF v_q = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.title,
    pr.description,
    pr.funding_status,
    pr.funding_visibility,
    pr.budget_total_kobo,
    pr.min_funding_target_kobo,
    pr.funding_deadline_at
  FROM public.projects pr
  WHERE pr.status = 'live'::public.project_status
    AND pr.funding_visibility = 'public'::public.project_funding_visibility
    AND pr.funding_status IN (
      'open'::public.project_funding_status,
      'target_met'::public.project_funding_status,
      'fully_funded'::public.project_funding_status
    )
    AND (
      lower(pr.title) LIKE '%' || v_q || '%'
      OR lower(coalesce(pr.description, '')) LIKE '%' || v_q || '%'
    )
  ORDER BY pr.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE TYPE public.search_discover_category AS ENUM (
  'top',
  'requests',
  'people',
  'projects'
);

CREATE OR REPLACE FUNCTION public.search_discover(
  p_category public.search_discover_category,
  p_query text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_q text := btrim(coalesce(p_query, ''));
  v_slice integer := LEAST(GREATEST(coalesce(p_limit, 20), 1), 50);
  v_requests jsonb := '[]'::jsonb;
  v_people jsonb := '[]'::jsonb;
  v_projects jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.assert_authenticated();

  IF p_category = 'people'::public.search_discover_category THEN
  IF v_q = '' THEN
      RETURN jsonb_build_object('people', v_people);
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_people
    FROM public.search_people(v_q, v_slice, p_offset) s;
    RETURN jsonb_build_object('people', v_people);
  END IF;

  IF p_category = 'projects'::public.search_discover_category THEN
    IF v_q = '' THEN
      RETURN jsonb_build_object('projects', v_projects);
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_projects
    FROM public.search_projects(v_q, v_slice, p_offset) s;
    RETURN jsonb_build_object('projects', v_projects);
  END IF;

  IF p_category = 'requests'::public.search_discover_category THEN
    IF v_q = '' OR p_latitude IS NULL OR p_longitude IS NULL THEN
      RETURN jsonb_build_object('requests', v_requests);
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_requests
    FROM public.search_requests(v_q, p_latitude, p_longitude, v_slice, p_offset) s;
    RETURN jsonb_build_object('requests', v_requests);
  END IF;

  IF v_q <> '' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_people
    FROM public.search_people(v_q, 5, 0) s;
    SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_projects
    FROM public.search_projects(v_q, 5, 0) s;
    IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
      SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_requests
      FROM public.search_requests(v_q, p_latitude, p_longitude, 5, 0) s;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'requests', v_requests,
    'people', v_people,
    'projects', v_projects,
    'ranking', 'deferred_ud_11'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS TABLE(
  premium_trial_started_at timestamptz,
  premium_trial_ends_at timestamptz,
  premium_active boolean,
  can_create_projects boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  RETURN QUERY
  SELECT
    p.premium_trial_started_at,
    p.premium_trial_ends_at,
    p.premium_trial_ends_at IS NOT NULL AND p.premium_trial_ends_at > now(),
    p.premium_trial_ends_at IS NOT NULL AND p.premium_trial_ends_at > now()
  FROM public.profiles p
  WHERE p.id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_reputation()
RETURNS TABLE(
  points_main integer,
  shield_remaining integer,
  crown_tier text,
  crown_public boolean,
  next_tier text,
  points_to_next_tier integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_rep public.user_reputation%rowtype;
  v_tier text;
  v_next text;
  v_threshold integer;
BEGIN
  PERFORM public.ensure_user_reputation_row(v_user_id);
  SELECT * INTO v_rep FROM public.user_reputation ur WHERE ur.user_id = v_user_id;

  v_tier := public.crown_tier_for_points(v_rep.points_main);

  v_next := CASE v_tier
    WHEN 'none' THEN 'bronze'
    WHEN 'bronze' THEN 'silver'
    WHEN 'silver' THEN 'diamond'
    WHEN 'diamond' THEN 'gold'
    ELSE NULL
  END;

  v_threshold := CASE v_next
    WHEN 'bronze' THEN public.reputation_config_int('crown_threshold_bronze', 3)
    WHEN 'silver' THEN public.reputation_config_int('crown_threshold_silver', 10)
    WHEN 'diamond' THEN public.reputation_config_int('crown_threshold_diamond', 25)
    WHEN 'gold' THEN public.reputation_config_int('crown_threshold_gold', 50)
    ELSE NULL
  END;

  RETURN QUERY
  SELECT
    v_rep.points_main,
    v_rep.shield_remaining,
    v_tier,
    v_rep.crown_public,
    v_next,
    CASE WHEN v_threshold IS NULL THEN NULL ELSE greatest(v_threshold - v_rep.points_main, 0) END;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_reputation_history(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  ledger_id uuid,
  delta_main integer,
  delta_shield integer,
  reason text,
  source text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_limit integer := LEAST(GREATEST(coalesce(p_limit, 50), 1), 100);
  v_offset integer := GREATEST(coalesce(p_offset, 0), 0);
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.delta_main,
    l.delta_shield,
    l.reason,
    l.source,
    l.created_at
  FROM public.reputation_ledger l
  WHERE l.user_id = v_user_id
  ORDER BY l.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_apply_reputation_delta(
  p_user_id uuid,
  p_delta_main integer,
  p_delta_shield integer,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_admin uuid;
  v_rep public.user_reputation%rowtype;
  v_capacity integer;
BEGIN
  PERFORM public.assert_admin_caller();
  v_admin := public.assert_authenticated();

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required' USING errcode = '22023';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason is required' USING errcode = '22023';
  END IF;

  IF p_delta_main = 0 AND coalesce(p_delta_shield, 0) = 0 THEN
    RAISE EXCEPTION 'delta cannot be zero' USING errcode = '22023';
  END IF;

  PERFORM public.ensure_user_reputation_row(p_user_id);
  SELECT * INTO v_rep FROM public.user_reputation ur WHERE ur.user_id = p_user_id FOR UPDATE;

  IF p_delta_main < 0 AND v_rep.points_main + p_delta_main < 0 THEN
    RAISE EXCEPTION 'points cannot go below zero' USING errcode = '55000';
  END IF;

  IF coalesce(p_delta_shield, 0) < 0 AND v_rep.shield_remaining + p_delta_shield < 0 THEN
    RAISE EXCEPTION 'shield cannot go below zero' USING errcode = '55000';
  END IF;

  v_capacity := public.reputation_config_int('gold_shield_capacity', 10);

  INSERT INTO public.reputation_ledger (
    user_id,
    delta_main,
    delta_shield,
    reason,
    source,
    created_by
  )
  VALUES (
    p_user_id,
    coalesce(p_delta_main, 0),
    coalesce(p_delta_shield, 0),
    btrim(p_reason),
    'admin',
    v_admin
  );

  UPDATE public.user_reputation
  SET points_main = v_rep.points_main + coalesce(p_delta_main, 0),
      shield_remaining = LEAST(
        v_rep.shield_remaining + coalesce(p_delta_shield, 0),
        CASE
          WHEN public.crown_tier_for_points(v_rep.points_main + coalesce(p_delta_main, 0)) = 'gold'
            THEN v_capacity
          ELSE 0
        END
      ),
      updated_at = now()
  WHERE user_id = p_user_id;

  PERFORM public.admin_record_audit_event(
    'reputation_adjust',
    'user'::public.admin_audit_entity_type,
    p_user_id,
    btrim(p_reason),
    'reputation:' || p_user_id::text || ':' || gen_random_uuid()::text,
    jsonb_build_object(
      'delta_main', p_delta_main,
      'delta_shield', p_delta_shield
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_crown_public(p_visible boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  PERFORM public.ensure_user_reputation_row(v_user_id);
  UPDATE public.user_reputation
  SET crown_public = coalesce(p_visible, true),
      updated_at = now()
  WHERE user_id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_username(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_people(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_projects(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_discover(
  public.search_discover_category, text, double precision, double precision, integer, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_reputation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_reputation_history(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_crown_public(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_reputation_delta(uuid, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_reputation_delta(uuid, integer, integer, text) TO service_role;