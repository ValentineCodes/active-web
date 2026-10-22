-- Configurable withdrawal policy, deployment environment marker, and future identity verification hook.

ALTER TYPE public.admin_audit_entity_type ADD VALUE IF NOT EXISTS 'withdrawal_policy';

CREATE TABLE public.platform_runtime_config (
  id integer PRIMARY KEY CHECK (id = 1),
  deployment_environment text NOT NULL DEFAULT 'production'
    CHECK (deployment_environment IN ('production', 'local')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_runtime_config IS
  'Singleton deployment marker. Not admin-editable via RPC; production stays production on hosted deploy.';

INSERT INTO public.platform_runtime_config (id, deployment_environment)
VALUES (1, 'production')
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON TABLE public.platform_runtime_config FROM PUBLIC;
GRANT SELECT ON TABLE public.platform_runtime_config TO service_role;

CREATE TABLE public.withdrawal_policy (
  id integer PRIMARY KEY CHECK (id = 1),
  min_amount_kobo bigint NOT NULL,
  max_amount_kobo bigint NOT NULL,
  max_daily_amount_kobo bigint NOT NULL,
  withdrawals_enabled boolean NOT NULL DEFAULT true,
  require_admin_review boolean NOT NULL DEFAULT true,
  require_identity_verification_for_withdrawal boolean NOT NULL DEFAULT true,
  allow_withdraw_without_identity_in_development boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT withdrawal_policy_min_positive CHECK (min_amount_kobo > 0),
  CONSTRAINT withdrawal_policy_max_gte_min CHECK (max_amount_kobo >= min_amount_kobo),
  CONSTRAINT withdrawal_policy_daily_gte_max CHECK (max_daily_amount_kobo >= max_amount_kobo),
  CONSTRAINT withdrawal_policy_amount_caps CHECK (
    min_amount_kobo <= 100000000
    AND max_amount_kobo <= 10000000000
    AND max_daily_amount_kobo <= 100000000000
  )
);

COMMENT ON TABLE public.withdrawal_policy IS
  'Singleton withdrawal limits and feature flags. Monetary fields are integer NGN kobo.';

COMMENT ON COLUMN public.withdrawal_policy.allow_withdraw_without_identity_in_development IS
  'Honored only when platform_runtime_config.deployment_environment = local. Never set true in production migrations.';

INSERT INTO public.withdrawal_policy (
  id,
  min_amount_kobo,
  max_amount_kobo,
  max_daily_amount_kobo,
  withdrawals_enabled,
  require_admin_review,
  require_identity_verification_for_withdrawal,
  allow_withdraw_without_identity_in_development
)
VALUES (
  1,
  10000,
  100000000,
  500000000,
  true,
  true,
  true,
  false
)
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON TABLE public.withdrawal_policy FROM PUBLIC;
GRANT SELECT ON TABLE public.withdrawal_policy TO service_role;

CREATE TABLE public.user_identity_verifications (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'none'
    CHECK (status IN ('none', 'pending', 'verified', 'failed')),
  provider text,
  provider_reference text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_identity_verifications_provider_when_verified CHECK (
    status <> 'verified'
    OR (
      provider IS NOT NULL
      AND btrim(provider) <> ''
      AND verified_at IS NOT NULL
    )
  )
);

COMMENT ON TABLE public.user_identity_verifications IS
  'Future provider-backed identity verification. No placeholder verified rows; development bypass uses policy + local environment only.';

REVOKE ALL ON TABLE public.user_identity_verifications FROM PUBLIC;
GRANT SELECT ON TABLE public.user_identity_verifications TO service_role;

CREATE OR REPLACE FUNCTION public.platform_is_local_deployment()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_runtime_config c
    WHERE c.id = 1
      AND c.deployment_environment = 'local'
  );
$$;

REVOKE ALL ON FUNCTION public.platform_is_local_deployment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_is_local_deployment() TO service_role;

CREATE OR REPLACE FUNCTION public.get_withdrawal_policy()
RETURNS public.withdrawal_policy
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p.*
  FROM public.withdrawal_policy p
  WHERE p.id = 1;
$$;

REVOKE ALL ON FUNCTION public.get_withdrawal_policy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_withdrawal_policy() TO service_role;

CREATE OR REPLACE FUNCTION public.user_has_provider_identity_verification(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_identity_verifications v
    WHERE v.user_id = p_user_id
      AND v.status = 'verified'
      AND v.provider IS NOT NULL
      AND btrim(v.provider) <> ''
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_provider_identity_verification(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_provider_identity_verification(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.withdrawal_identity_development_bypass_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.withdrawal_policy p
    WHERE p.id = 1
      AND p.allow_withdraw_without_identity_in_development
      AND public.platform_is_local_deployment()
  );
$$;

REVOKE ALL ON FUNCTION public.withdrawal_identity_development_bypass_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdrawal_identity_development_bypass_active() TO service_role;

CREATE OR REPLACE FUNCTION public.assert_withdrawal_identity_allowed(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_policy public.withdrawal_policy;
BEGIN
  SELECT * INTO v_policy FROM public.get_withdrawal_policy();

  IF NOT v_policy.require_identity_verification_for_withdrawal THEN
    RETURN;
  END IF;

  IF public.withdrawal_identity_development_bypass_active() THEN
    RETURN;
  END IF;

  IF public.user_has_provider_identity_verification(p_user_id) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'identity verification is required before you can withdraw'
    USING errcode = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_withdrawal_identity_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_withdrawal_identity_allowed(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.withdrawal_lagos_calendar_day(p_at timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT (timezone('Africa/Lagos', coalesce(p_at, now())))::date;
$$;

CREATE OR REPLACE FUNCTION public.user_withdrawal_daily_reserved_kobo(
  p_user_id uuid,
  p_day date
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(sum(w.amount_kobo), 0)::bigint
  FROM public.wallet_withdrawals w
  WHERE w.user_id = p_user_id
    AND w.status IN (
      'pending'::public.wallet_withdrawal_status,
      'processing'::public.wallet_withdrawal_status,
      'completed'::public.wallet_withdrawal_status
    )
    AND public.withdrawal_lagos_calendar_day(w.created_at) = p_day;
$$;

REVOKE ALL ON FUNCTION public.user_withdrawal_daily_reserved_kobo(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_withdrawal_daily_reserved_kobo(uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.get_public_withdrawal_policy()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'withdrawals_enabled', p.withdrawals_enabled,
    'min_amount_kobo', p.min_amount_kobo,
    'max_amount_kobo', p.max_amount_kobo,
    'max_daily_amount_kobo', p.max_daily_amount_kobo,
    'require_admin_review', p.require_admin_review,
    'require_identity_verification', p.require_identity_verification_for_withdrawal
  )
  FROM public.withdrawal_policy p
  WHERE p.id = 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_withdrawal_policy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_withdrawal_policy() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_get_withdrawal_policy()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_policy public.withdrawal_policy;
  v_env text;
BEGIN
  PERFORM public.admin_require_permission('withdrawals');

  SELECT * INTO v_policy FROM public.get_withdrawal_policy();

  SELECT c.deployment_environment
    INTO v_env
  FROM public.platform_runtime_config c
  WHERE c.id = 1;

  RETURN jsonb_build_object(
    'policy', jsonb_build_object(
      'min_amount_kobo', v_policy.min_amount_kobo,
      'max_amount_kobo', v_policy.max_amount_kobo,
      'max_daily_amount_kobo', v_policy.max_daily_amount_kobo,
      'withdrawals_enabled', v_policy.withdrawals_enabled,
      'require_admin_review', v_policy.require_admin_review,
      'require_identity_verification_for_withdrawal', v_policy.require_identity_verification_for_withdrawal,
      'allow_withdraw_without_identity_in_development', v_policy.allow_withdraw_without_identity_in_development,
      'updated_at', v_policy.updated_at,
      'updated_by', v_policy.updated_by
    ),
    'deployment_environment', v_env,
    'identity_development_bypass_active', public.withdrawal_identity_development_bypass_active()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_withdrawal_policy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_withdrawal_policy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_withdrawal_policy() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_update_withdrawal_policy(
  p_min_amount_kobo bigint,
  p_max_amount_kobo bigint,
  p_max_daily_amount_kobo bigint,
  p_withdrawals_enabled boolean,
  p_require_admin_review boolean,
  p_require_identity_verification_for_withdrawal boolean,
  p_allow_withdraw_without_identity_in_development boolean,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_key text := btrim(p_idempotency_key);
  v_existing uuid;
  v_before public.withdrawal_policy;
  v_after public.withdrawal_policy;
BEGIN
  PERFORM public.admin_require_permission('withdrawals');

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  SELECT a.id INTO v_existing
  FROM public.admin_audit_events a
  WHERE a.idempotency_key = v_key;

  IF v_existing IS NOT NULL THEN
    RETURN public.admin_get_withdrawal_policy();
  END IF;

  IF p_min_amount_kobo IS NULL OR p_min_amount_kobo <= 0 THEN
    RAISE EXCEPTION 'min_amount_kobo must be positive' USING errcode = '22023';
  END IF;

  IF p_max_amount_kobo IS NULL OR p_max_amount_kobo < p_min_amount_kobo THEN
    RAISE EXCEPTION 'max_amount_kobo must be >= min_amount_kobo' USING errcode = '22023';
  END IF;

  IF p_max_daily_amount_kobo IS NULL OR p_max_daily_amount_kobo < p_max_amount_kobo THEN
    RAISE EXCEPTION 'max_daily_amount_kobo must be >= max_amount_kobo' USING errcode = '22023';
  END IF;

  IF p_min_amount_kobo > 100000000
    OR p_max_amount_kobo > 10000000000
    OR p_max_daily_amount_kobo > 100000000000
  THEN
    RAISE EXCEPTION 'withdrawal policy amounts exceed platform caps' USING errcode = '22023';
  END IF;

  IF p_allow_withdraw_without_identity_in_development
    AND NOT public.platform_is_local_deployment()
  THEN
    RAISE EXCEPTION 'identity development bypass can only be enabled on local deployment environments'
      USING errcode = '55000';
  END IF;

  SELECT * INTO v_before FROM public.get_withdrawal_policy();

  UPDATE public.withdrawal_policy p
  SET
    min_amount_kobo = p_min_amount_kobo,
    max_amount_kobo = p_max_amount_kobo,
    max_daily_amount_kobo = p_max_daily_amount_kobo,
    withdrawals_enabled = coalesce(p_withdrawals_enabled, true),
    require_admin_review = coalesce(p_require_admin_review, true),
    require_identity_verification_for_withdrawal = coalesce(p_require_identity_verification_for_withdrawal, true),
    allow_withdraw_without_identity_in_development = coalesce(
      p_allow_withdraw_without_identity_in_development,
      false
    ),
    updated_at = now(),
    updated_by = v_actor
  WHERE p.id = 1
  RETURNING * INTO v_after;

  PERFORM public.admin_record_audit_event(
    'withdrawal_policy_update',
    'withdrawal_policy'::public.admin_audit_entity_type,
    NULL,
    NULL,
    v_key,
    jsonb_build_object(
      'before', jsonb_build_object(
        'min_amount_kobo', v_before.min_amount_kobo,
        'max_amount_kobo', v_before.max_amount_kobo,
        'max_daily_amount_kobo', v_before.max_daily_amount_kobo,
        'withdrawals_enabled', v_before.withdrawals_enabled,
        'require_admin_review', v_before.require_admin_review,
        'require_identity_verification_for_withdrawal', v_before.require_identity_verification_for_withdrawal,
        'allow_withdraw_without_identity_in_development', v_before.allow_withdraw_without_identity_in_development
      ),
      'after', jsonb_build_object(
        'min_amount_kobo', v_after.min_amount_kobo,
        'max_amount_kobo', v_after.max_amount_kobo,
        'max_daily_amount_kobo', v_after.max_daily_amount_kobo,
        'withdrawals_enabled', v_after.withdrawals_enabled,
        'require_admin_review', v_after.require_admin_review,
        'require_identity_verification_for_withdrawal', v_after.require_identity_verification_for_withdrawal,
        'allow_withdraw_without_identity_in_development', v_after.allow_withdraw_without_identity_in_development
      )
    )
  );

  RETURN public.admin_get_withdrawal_policy();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_withdrawal_policy(
  bigint, bigint, bigint, boolean, boolean, boolean, boolean, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_withdrawal_policy(
  bigint, bigint, bigint, boolean, boolean, boolean, boolean, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_withdrawal_policy(
  bigint, bigint, bigint, boolean, boolean, boolean, boolean, text
) TO service_role;
