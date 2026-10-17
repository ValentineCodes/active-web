-- Admin user/request operations, audit trail, and account restrictions.

CREATE TYPE public.admin_audit_entity_type AS ENUM (
  'user',
  'request',
  'admin_member'
);

CREATE TYPE public.user_restriction_scope AS ENUM (
  'new_marketplace_listings'
);

COMMENT ON TYPE public.user_restriction_scope IS
  'new_marketplace_listings: blocks posting new requests and submitting new offers. Does not end engagements, move funds, or block existing engagement access.';

CREATE TABLE public.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  action text NOT NULL,
  entity_type public.admin_audit_entity_type NOT NULL,
  entity_id uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_events_action_check CHECK (char_length(btrim(action)) >= 1),
  CONSTRAINT admin_audit_events_reason_when_required CHECK (
    reason IS NULL OR char_length(btrim(reason)) >= 10
  )
);

CREATE INDEX admin_audit_events_entity_idx
  ON public.admin_audit_events (entity_type, entity_id, created_at DESC);

CREATE INDEX admin_audit_events_actor_idx
  ON public.admin_audit_events (actor_admin_id, created_at DESC);

CREATE TABLE public.user_account_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  scope public.user_restriction_scope NOT NULL DEFAULT 'new_marketplace_listings',
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  lifted_at timestamptz,
  lifted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  lift_reason text,
  idempotency_key text NOT NULL UNIQUE,
  CONSTRAINT user_account_restrictions_reason_check CHECK (char_length(btrim(reason)) >= 10),
  CONSTRAINT user_account_restrictions_lift_reason_check CHECK (
    lift_reason IS NULL OR char_length(btrim(lift_reason)) >= 10
  )
);

CREATE UNIQUE INDEX user_account_restrictions_one_active_per_scope_idx
  ON public.user_account_restrictions (user_id, scope)
  WHERE lifted_at IS NULL;

CREATE TABLE public.admin_user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  author_admin_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_user_notes_body_check CHECK (char_length(btrim(body)) >= 3)
);

CREATE INDEX admin_user_notes_user_idx
  ON public.admin_user_notes (user_id, created_at DESC);

ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_account_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_user_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_audit_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_account_restrictions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.admin_user_notes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_audit_events TO service_role;
GRANT ALL ON TABLE public.user_account_restrictions TO service_role;
GRANT ALL ON TABLE public.admin_user_notes TO service_role;

CREATE OR REPLACE FUNCTION public.admin_require_permission(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_perms jsonb := public.get_my_admin_permissions();
BEGIN
  IF v_perms IS NULL OR coalesce((v_perms->>p_key)::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;
  RETURN v_perms;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_require_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_require_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_require_permission(text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_record_audit_event(
  p_action text,
  p_entity_type public.admin_audit_entity_type,
  p_entity_id uuid,
  p_reason text,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  SELECT a.id INTO v_existing
  FROM public.admin_audit_events a
  WHERE a.idempotency_key = p_idempotency_key;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.admin_audit_events (
    actor_admin_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata,
    idempotency_key
  )
  VALUES (
    v_actor,
    btrim(p_action),
    p_entity_type,
    p_entity_id,
    CASE WHEN p_reason IS NULL THEN NULL ELSE btrim(p_reason) END,
    coalesce(p_metadata, '{}'::jsonb),
    p_idempotency_key
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_audit_event(text, public.admin_audit_entity_type, uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_record_audit_event(text, public.admin_audit_entity_type, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_audit_event(text, public.admin_audit_entity_type, uuid, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.assert_user_marketplace_listing_allowed(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_account_restrictions uar
    WHERE uar.user_id = p_user_id
      AND uar.lifted_at IS NULL
      AND uar.scope = 'new_marketplace_listings'::public.user_restriction_scope
  ) THEN
    RAISE EXCEPTION 'this account is restricted from new marketplace activity'
      USING errcode = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_user_marketplace_listing_allowed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_user_marketplace_listing_allowed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_user_marketplace_listing_allowed(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.assert_onboarded()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.display_name IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'finish setting up your profile first' USING errcode = '42501';
  END IF;

  PERFORM public.assert_user_marketplace_listing_allowed(v_user_id);

  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_query text DEFAULT '',
  p_filter text DEFAULT 'all',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_perms jsonb;
  v_show_phone boolean;
  v_items jsonb;
  v_total bigint;
  v_q text := btrim(coalesce(p_query, ''));
BEGIN
  v_perms := public.admin_require_permission('users');
  v_show_phone := coalesce((v_perms->>'role')::text IN ('super_admin', 'support_admin'), false);

  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'limit must be between 1 and 100' USING errcode = '22023';
  END IF;

  IF p_offset < 0 THEN
    RAISE EXCEPTION 'offset must be non-negative' USING errcode = '22023';
  END IF;

  SELECT count(*)::bigint
  INTO v_total
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE (
    v_q = ''
    OR p.display_name ILIKE '%' || v_q || '%'
    OR p.id::text ILIKE '%' || v_q || '%'
    OR (v_show_phone AND u.phone ILIKE '%' || v_q || '%')
  )
  AND (
    p_filter = 'all'
    OR (p_filter = 'restricted' AND EXISTS (
      SELECT 1 FROM public.user_account_restrictions r
      WHERE r.user_id = p.id AND r.lifted_at IS NULL
    ))
    OR (p_filter = 'onboarded' AND p.display_name IS NOT NULL)
    OR (p_filter = 'not_onboarded' AND p.display_name IS NULL)
  );

  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      p.id,
      p.display_name,
      p.avatar_path,
      CASE WHEN v_show_phone THEN u.phone ELSE NULL END AS phone,
      u.phone_confirmed_at IS NOT NULL AS phone_confirmed,
      p.created_at,
      p.rating_average,
      p.rating_count,
      p.jobs_completed,
      p.requests_completed,
      (p.display_name IS NOT NULL) AS is_onboarded,
      EXISTS (
        SELECT 1 FROM public.user_account_restrictions r
        WHERE r.user_id = p.id AND r.lifted_at IS NULL
      ) AS is_restricted,
      (SELECT count(*)::int FROM public.requests r WHERE r.requester_id = p.id) AS requests_posted_count,
      (SELECT count(*)::int FROM public.requests r WHERE r.selected_user_id = p.id) AS engagements_as_provider_count,
      (SELECT count(*)::int FROM public.service_problems sp WHERE sp.reported_by = p.id) AS reports_filed_count
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE (
      v_q = ''
      OR p.display_name ILIKE '%' || v_q || '%'
      OR p.id::text ILIKE '%' || v_q || '%'
      OR (v_show_phone AND u.phone ILIKE '%' || v_q || '%')
    )
    AND (
      p_filter = 'all'
      OR (p_filter = 'restricted' AND EXISTS (
        SELECT 1 FROM public.user_account_restrictions r
        WHERE r.user_id = p.id AND r.lifted_at IS NULL
      ))
      OR (p_filter = 'onboarded' AND p.display_name IS NOT NULL)
      OR (p_filter = 'not_onboarded' AND p.display_name IS NULL)
    )
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, text, integer, integer) TO service_role;
