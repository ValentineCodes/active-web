-- Audited admin access to encrypted NIN (decrypt in Edge Function only; never in audit metadata).

CREATE OR REPLACE FUNCTION public.get_my_admin_permissions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_role public.admin_role;
BEGIN
  SELECT am.role
    INTO v_role
  FROM public.admin_members am
  WHERE am.user_id = auth.uid();

  IF v_role IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'role', v_role,
    'overview', true,
    'users', v_role IN (
      'super_admin'::public.admin_role,
      'support_admin'::public.admin_role,
      'finance_admin'::public.admin_role
    ),
    'requests', v_role IN ('super_admin'::public.admin_role, 'support_admin'::public.admin_role),
    'reports', v_role IN ('super_admin'::public.admin_role, 'support_admin'::public.admin_role),
    'transactions', v_role IN ('super_admin'::public.admin_role, 'finance_admin'::public.admin_role),
    'wallets', v_role IN ('super_admin'::public.admin_role, 'finance_admin'::public.admin_role),
    'withdrawals', v_role IN ('super_admin'::public.admin_role, 'finance_admin'::public.admin_role),
    'operational_issues', v_role IN ('super_admin'::public.admin_role, 'support_admin'::public.admin_role),
    'audit_logs', v_role = 'super_admin'::public.admin_role,
    'settings', v_role = 'super_admin'::public.admin_role,
    'user_nin_reveal', v_role IN ('super_admin'::public.admin_role, 'finance_admin'::public.admin_role)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_actor_may_reveal_user_nin(p_actor_admin_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_members am
    WHERE am.user_id = p_actor_admin_id
      AND am.role IN ('super_admin'::public.admin_role, 'finance_admin'::public.admin_role)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_actor_may_reveal_user_nin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_actor_may_reveal_user_nin(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_service_user_nin_decrypt_bundle(
  p_actor_admin_id uuid,
  p_target_user_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_reason text := btrim(coalesce(p_reason, ''));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_secret public.user_nin_secrets%rowtype;
BEGIN
  IF p_actor_admin_id IS NULL OR p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING errcode = '22023';
  END IF;

  IF NOT public.admin_actor_may_reveal_user_nin(p_actor_admin_id) THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  IF char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'reason is required' USING errcode = '22023';
  END IF;

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_target_user_id) THEN
    RAISE EXCEPTION 'user not found' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_secret
  FROM public.user_nin_secrets s
  WHERE s.user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nin not submitted for this user' USING errcode = 'P0002';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor_admin_id, 'role', 'authenticated')::text,
    true
  );

  PERFORM public.admin_record_audit_event(
    'user_nin_reveal',
    'user'::public.admin_audit_entity_type,
    p_target_user_id,
    v_reason,
    v_key,
    jsonb_build_object('target_user_id', p_target_user_id, 'actor_admin_id', p_actor_admin_id)
  );

  RETURN jsonb_build_object(
    'ciphertext_hex', encode(v_secret.ciphertext, 'hex'),
    'nonce_hex', encode(v_secret.nonce, 'hex'),
    'key_version', v_secret.key_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_service_user_nin_decrypt_bundle(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_service_user_nin_decrypt_bundle(uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_service_user_nin_decrypt_bundle(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_service_user_nin_decrypt_bundle(uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_get_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_perms jsonb;
  v_show_phone boolean;
  v_show_financial boolean;
  v_profile jsonb;
  v_wallet jsonb;
  v_restriction jsonb;
  v_identity jsonb;
BEGIN
  v_perms := public.admin_require_permission('users');
  v_show_phone := coalesce((v_perms->>'role')::text IN ('super_admin', 'support_admin'), false);
  v_show_financial := coalesce((v_perms->>'transactions')::boolean, false);

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id) THEN
    RAISE EXCEPTION 'user not found' USING errcode = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'avatar_path', p.avatar_path,
    'bio', p.bio,
    'phone', CASE WHEN v_show_phone THEN u.phone ELSE NULL END,
    'phone_confirmed', u.phone_confirmed_at IS NOT NULL,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'rating_average', p.rating_average,
    'rating_count', p.rating_count,
    'jobs_completed', p.jobs_completed,
    'requests_completed', p.requests_completed,
    'avatar_captured_in_app', p.avatar_captured_in_app,
    'is_onboarded', p.display_name IS NOT NULL
  )
  INTO v_profile
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_user_id;

  SELECT jsonb_build_object(
    'nin_submitted', s.user_id IS NOT NULL,
    'submitted_at', s.submitted_at,
    'nin_masked', CASE
      WHEN s.user_id IS NOT NULL THEN public.mask_nin_last_four(s.nin_last_four)
      ELSE NULL
    END
  )
  INTO v_identity
  FROM public.profiles p
  LEFT JOIN public.user_nin_secrets s ON s.user_id = p.id
  WHERE p.id = p_user_id;

  SELECT to_jsonb(r_row)
  INTO v_restriction
  FROM (
    SELECT
      r.id,
      r.scope::text AS scope,
      r.reason,
      r.created_at,
      r.created_by
    FROM public.user_account_restrictions r
    WHERE r.user_id = p_user_id
      AND r.lifted_at IS NULL
    ORDER BY r.created_at DESC
    LIMIT 1
  ) r_row;

  IF v_show_financial THEN
    SELECT jsonb_build_object(
      'available_balance_kobo', w.available_balance,
      'locked_balance_kobo', w.locked_balance,
      'currency', w.currency
    )
    INTO v_wallet
    FROM public.wallets w
    WHERE w.user_id = p_user_id;
  ELSE
    v_wallet := NULL;
  END IF;

  RETURN jsonb_build_object(
    'profile', v_profile,
    'identity', coalesce(
      v_identity,
      jsonb_build_object('nin_submitted', false, 'submitted_at', null, 'nin_masked', null)
    ),
    'active_restriction', v_restriction,
    'wallet', v_wallet,
    'counts', jsonb_build_object(
      'requests_posted', (SELECT count(*) FROM public.requests r WHERE r.requester_id = p_user_id),
      'engagements_as_provider', (SELECT count(*) FROM public.requests r WHERE r.selected_user_id = p_user_id),
      'responses_submitted', (SELECT count(*) FROM public.request_responses rr WHERE rr.responder_id = p_user_id),
      'reports_filed', (SELECT count(*) FROM public.service_problems sp WHERE sp.reported_by = p_user_id),
      'reports_against', (
        SELECT count(*)
        FROM public.service_problems sp
        INNER JOIN public.requests r ON r.id = sp.request_id
        WHERE r.requester_id = p_user_id OR r.selected_user_id = p_user_id
      )
    ),
    'requests', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT
          r.id,
          r.title,
          public.request_effective_status(r.status, r.expires_at)::text AS status,
          r.offered_amount,
          r.created_at,
          'requester'::text AS role
        FROM public.requests r
        WHERE r.requester_id = p_user_id
        ORDER BY r.created_at DESC
        LIMIT 20
      ) x
    ), '[]'::jsonb),
    'engagements', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.accepted_at DESC NULLS LAST)
      FROM (
        SELECT
          r.id,
          r.title,
          r.status::text AS status,
          r.accepted_at,
          r.completed_at,
          'provider'::text AS role
        FROM public.requests r
        WHERE r.selected_user_id = p_user_id
        ORDER BY coalesce(r.accepted_at, r.created_at) DESC
        LIMIT 20
      ) x
    ), '[]'::jsonb),
    'responses', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT
          rr.id,
          rr.request_id,
          rr.status::text AS status,
          rr.quoted_amount,
          rr.created_at
        FROM public.request_responses rr
        WHERE rr.responder_id = p_user_id
        ORDER BY rr.created_at DESC
        LIMIT 20
      ) x
    ), '[]'::jsonb),
    'reports', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT
          sp.id,
          sp.request_id,
          sp.kind::text AS kind,
          sp.status,
          sp.resolution,
          sp.created_at
        FROM public.service_problems sp
        WHERE sp.reported_by = p_user_id
           OR EXISTS (
             SELECT 1 FROM public.requests r
             WHERE r.id = sp.request_id
               AND (r.requester_id = p_user_id OR r.selected_user_id = p_user_id)
           )
        ORDER BY sp.created_at DESC
        LIMIT 20
      ) x
    ), '[]'::jsonb),
    'transactions', CASE
      WHEN v_show_financial THEN coalesce((
        SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
        FROM (
          SELECT
            wt.id,
            wt.type::text AS type,
            wt.status::text AS status,
            wt.amount,
            wt.request_id,
            wt.created_at
          FROM public.wallet_transactions wt
          WHERE wt.user_id = p_user_id
          ORDER BY wt.created_at DESC
          LIMIT 25
        ) x
      ), '[]'::jsonb)
      ELSE NULL
    END,
    'notes', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT n.id, n.body, n.author_admin_id, n.created_at
        FROM public.admin_user_notes n
        WHERE n.user_id = p_user_id
        ORDER BY n.created_at DESC
        LIMIT 30
      ) x
    ), '[]'::jsonb),
    'audit_events', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT a.id, a.action, a.reason, a.metadata, a.actor_admin_id, a.created_at
        FROM public.admin_audit_events a
        WHERE a.entity_type = 'user'::public.admin_audit_entity_type
          AND a.entity_id = p_user_id
        ORDER BY a.created_at DESC
        LIMIT 30
      ) x
    ), '[]'::jsonb)
  );
END;
$$;
