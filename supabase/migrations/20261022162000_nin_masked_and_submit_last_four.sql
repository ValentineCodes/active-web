-- Masked NIN display for clients (last four only) and submit RPC last-four metadata.

ALTER TABLE public.user_nin_secrets
  ADD COLUMN IF NOT EXISTS nin_last_four text;

ALTER TABLE public.user_nin_secrets
  DROP CONSTRAINT IF EXISTS user_nin_secrets_nin_last_four_check;

ALTER TABLE public.user_nin_secrets
  ADD CONSTRAINT user_nin_secrets_nin_last_four_check CHECK (
    nin_last_four IS NULL OR nin_last_four ~ '^[0-9]{4}$'
  );

CREATE OR REPLACE FUNCTION public.mask_nin_last_four(p_last_four text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO ''
AS $$
  SELECT '•••••••' || p_last_four;
$$;

REVOKE ALL ON FUNCTION public.mask_nin_last_four(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mask_nin_last_four(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mask_nin_last_four(text) TO service_role;

DROP FUNCTION IF EXISTS public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text);

CREATE OR REPLACE FUNCTION public.submit_user_nin_encrypted(
  p_user_id uuid,
  p_ciphertext bytea,
  p_nonce bytea,
  p_key_version text,
  p_fingerprint text,
  p_nin_last_four text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_existing public.user_nin_secrets%rowtype;
  v_fp text := lower(btrim(p_fingerprint));
  v_key text := btrim(p_key_version);
  v_last_four text := btrim(p_nin_last_four);
  v_now timestamptz := now();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING errcode = '22023';
  END IF;

  IF p_ciphertext IS NULL OR octet_length(p_ciphertext) = 0 THEN
    RAISE EXCEPTION 'ciphertext is required' USING errcode = '22023';
  END IF;

  IF p_nonce IS NULL OR octet_length(p_nonce) <> 12 THEN
    RAISE EXCEPTION 'invalid encryption nonce' USING errcode = '22023';
  END IF;

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'key_version is required' USING errcode = '22023';
  END IF;

  IF v_fp IS NULL OR v_fp = '' OR v_fp !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid nin fingerprint' USING errcode = '22023';
  END IF;

  IF v_last_four IS NULL OR v_last_four !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'invalid nin last four' USING errcode = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT * INTO v_existing
  FROM public.user_nin_secrets s
  WHERE s.user_id = p_user_id;

  IF FOUND THEN
    IF v_existing.nin_fingerprint = v_fp THEN
      RETURN jsonb_build_object(
        'status', 'already_submitted',
        'identity_verified', public.user_marketplace_identity_verified(p_user_id),
        'nin_masked', public.mask_nin_last_four(v_existing.nin_last_four)
      );
    END IF;

    RAISE EXCEPTION 'nin already submitted for this account' USING errcode = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_nin_secrets s
    WHERE s.nin_fingerprint = v_fp
  ) THEN
    RAISE EXCEPTION 'nin is already linked to another account' USING errcode = '55000';
  END IF;

  INSERT INTO public.user_nin_secrets (
    user_id,
    ciphertext,
    nonce,
    key_version,
    nin_fingerprint,
    nin_last_four,
    submitted_at
  )
  VALUES (
    p_user_id,
    p_ciphertext,
    p_nonce,
    v_key,
    v_fp,
    v_last_four,
    v_now
  );

  INSERT INTO public.user_identity_verifications (
    user_id,
    status,
    provider,
    provider_reference,
    verified_at,
    created_at,
    updated_at
  )
  VALUES (
    p_user_id,
    'verified',
    'nin_self_attested',
    NULL,
    v_now,
    v_now,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    status = 'verified',
    provider = 'nin_self_attested',
    provider_reference = NULL,
    verified_at = coalesce(public.user_identity_verifications.verified_at, excluded.verified_at),
    updated_at = excluded.updated_at;

  RETURN jsonb_build_object(
    'status', 'submitted',
    'identity_verified', true,
    'nin_masked', public.mask_nin_last_four(v_last_four)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_identity_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_verified boolean;
  v_submitted boolean;
  v_masked text;
BEGIN
  v_verified := public.user_marketplace_identity_verified(v_user_id);

  SELECT EXISTS (
    SELECT 1 FROM public.user_nin_secrets s WHERE s.user_id = v_user_id
  )
  INTO v_submitted;

  SELECT public.mask_nin_last_four(s.nin_last_four)
  INTO v_masked
  FROM public.user_nin_secrets s
  WHERE s.user_id = v_user_id
    AND s.nin_last_four IS NOT NULL;

  IF NOT coalesce(v_submitted, false) AND v_verified THEN
    v_submitted := true;
  END IF;

  RETURN jsonb_build_object(
    'nin_submitted', coalesce(v_submitted, false),
    'identity_verified', coalesce(v_verified, false),
    'nin_masked', v_masked
  );
END;
$$;
