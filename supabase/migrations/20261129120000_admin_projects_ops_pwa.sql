-- Phase 10: admin project oversight, premium overrides, reputation fixes, scheduled funding evaluation.

ALTER TYPE public.admin_audit_entity_type ADD VALUE IF NOT EXISTS 'project';

CREATE OR REPLACE FUNCTION public.evaluate_due_project_funding(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_project_id uuid;
  v_evaluated integer := 0;
BEGIN
  IF p_limit < 1 THEN
    RAISE EXCEPTION 'limit must be at least 1' USING errcode = '22023';
  END IF;

  FOR v_project_id IN
    SELECT p.id
    FROM public.projects p
    WHERE p.status = 'live'::public.project_status
      AND p.funding_deadline_at IS NOT NULL
      AND now() >= p.funding_deadline_at
      AND p.funding_status IN (
        'open'::public.project_funding_status,
        'target_met'::public.project_funding_status
      )
    ORDER BY p.funding_deadline_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.evaluate_project_funding_status(v_project_id);
    v_evaluated := v_evaluated + 1;
  END LOOP;

  RETURN v_evaluated;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_due_project_funding(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_due_project_funding(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_list_projects(
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
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_limit integer := LEAST(GREATEST(coalesce(p_limit, 25), 1), 100);
  v_offset integer := GREATEST(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
BEGIN
  PERFORM public.admin_require_permission('requests');

  SELECT count(*)::int
  INTO v_total
  FROM public.projects p
  INNER JOIN public.profiles pr ON pr.id = p.creator_id
  WHERE (v_q = '' OR lower(p.title) LIKE '%' || v_q || '%' OR p.id::text = v_q)
    AND (
      p_filter IS DISTINCT FROM 'open_funding'
      OR p.funding_status IN (
        'open'::public.project_funding_status,
        'target_met'::public.project_funding_status
      )
    )
    AND (
      p_filter IS DISTINCT FROM 'unsuccessful'
      OR p.funding_status = 'unsuccessful'::public.project_funding_status
    )
    AND (
      p_filter IS DISTINCT FROM 'live'
      OR p.status = 'live'::public.project_status
    );

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      p.id,
      p.title,
      p.status::text AS status,
      p.funding_status::text AS funding_status,
      p.funding_visibility::text AS funding_visibility,
      p.budget_total_kobo,
      p.funding_deadline_at,
      p.created_at,
      pr.display_name AS creator_name,
      pr.id AS creator_id,
      coalesce(pool.contributed_total_kobo, 0) AS contributed_total_kobo
    FROM public.projects p
    INNER JOIN public.profiles pr ON pr.id = p.creator_id
    LEFT JOIN public.project_funding_pools pool ON pool.project_id = p.id
    WHERE (v_q = '' OR lower(p.title) LIKE '%' || v_q || '%' OR p.id::text = v_q)
      AND (
        p_filter IS DISTINCT FROM 'open_funding'
        OR p.funding_status IN (
          'open'::public.project_funding_status,
          'target_met'::public.project_funding_status
        )
      )
      AND (
        p_filter IS DISTINCT FROM 'unsuccessful'
        OR p.funding_status = 'unsuccessful'::public.project_funding_status
      )
      AND (
        p_filter IS DISTINCT FROM 'live'
        OR p.status = 'live'::public.project_status
      )
    ORDER BY p.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) x;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_project(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_row jsonb;
  v_pool jsonb;
  v_assignments jsonb;
  v_disputes jsonb;
  v_contribution_count integer;
BEGIN
  PERFORM public.admin_require_permission('requests');

  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required' USING errcode = '22023';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'description', p.description,
    'status', p.status::text,
    'funding_status', p.funding_status::text,
    'funding_visibility', p.funding_visibility::text,
    'project_visibility', p.project_visibility::text,
    'budget_total_kobo', p.budget_total_kobo,
    'min_funding_target_kobo', p.min_funding_target_kobo,
    'min_contribution_kobo', p.min_contribution_kobo,
    'funding_deadline_at', p.funding_deadline_at,
    'funding_opened_at', p.funding_opened_at,
    'created_at', p.created_at,
    'creator_id', p.creator_id,
    'creator_name', pr.display_name
  )
  INTO v_row
  FROM public.projects p
  INNER JOIN public.profiles pr ON pr.id = p.creator_id
  WHERE p.id = p_project_id;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'contributed_total_kobo', pool.contributed_total_kobo,
    'reserved_total_kobo', pool.reserved_total_kobo,
    'committed_compensation_kobo', pool.committed_compensation_kobo
  )
  INTO v_pool
  FROM public.project_funding_pools pool
  WHERE pool.project_id = p_project_id;

  SELECT count(*)::int
  INTO v_contribution_count
  FROM public.project_contributions c
  WHERE c.project_id = p_project_id;

  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO v_assignments
  FROM (
    SELECT
      pa.id,
      pa.status::text AS status,
      pa.worker_id,
      pw.display_name AS worker_name,
      pa.created_at,
      pa.accepted_at
    FROM public.project_assignments pa
    LEFT JOIN public.profiles pw ON pw.id = pa.worker_id
    WHERE pa.project_id = p_project_id
    ORDER BY pa.created_at DESC
    LIMIT 30
  ) a;

  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC), '[]'::jsonb)
  INTO v_disputes
  FROM (
    SELECT
      d.id,
      d.assignment_id,
      d.status::text AS status,
      left(d.description, 280) AS description,
      d.created_at,
      d.reported_by
    FROM public.project_assignment_disputes d
    INNER JOIN public.project_assignments pa ON pa.id = d.assignment_id
    WHERE pa.project_id = p_project_id
    ORDER BY d.created_at DESC
    LIMIT 30
  ) d;

  PERFORM public.admin_record_audit_event(
    'project_view',
    'project'::public.admin_audit_entity_type,
    p_project_id,
  NULL,
    'project-view:' || p_project_id::text || ':' || gen_random_uuid()::text,
    jsonb_build_object('action', 'read_detail')
  );

  RETURN jsonb_build_object(
    'project', v_row,
    'pool', coalesce(v_pool, '{}'::jsonb),
    'contribution_count', v_contribution_count,
    'assignments', v_assignments,
    'disputes', v_disputes,
    'refund_note', 'Contributor refund allocation awaits UD-19; admin cannot execute proportional refunds yet.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_project_disputes(
  p_filter text DEFAULT 'open',
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
  v_limit integer := LEAST(GREATEST(coalesce(p_limit, 25), 1), 100);
  v_offset integer := GREATEST(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
BEGIN
  PERFORM public.admin_require_permission('reports');

  SELECT count(*)::int
  INTO v_total
  FROM public.project_assignment_disputes d
  WHERE p_filter IS DISTINCT FROM 'open' OR d.status = 'open'::text;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      d.id,
      d.assignment_id,
      d.status,
      left(d.description, 280) AS description,
      d.created_at,
      pa.project_id,
      p.title AS project_title
    FROM public.project_assignment_disputes d
    INNER JOIN public.project_assignments pa ON pa.id = d.assignment_id
    INNER JOIN public.projects p ON p.id = pa.project_id
    WHERE p_filter IS DISTINCT FROM 'open' OR d.status = 'open'
    ORDER BY d.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) x;

  RETURN jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'items', v_items);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_override_premium_trial(
  p_user_id uuid,
  p_trial_ends_at timestamptz,
  p_reason text,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_perms jsonb;
  v_before timestamptz;
BEGIN
  v_perms := public.admin_require_permission('users');
  IF (v_perms->>'role')::text <> 'super_admin' THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  IF p_user_id IS NULL OR p_trial_ends_at IS NULL THEN
    RAISE EXCEPTION 'user_id and trial end are required' USING errcode = '22023';
  END IF;

  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'a reason of at least 10 characters is required' USING errcode = '22023';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  SELECT p.premium_trial_ends_at INTO v_before
  FROM public.profiles p
  WHERE p.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found' USING errcode = 'P0002';
  END IF;

  UPDATE public.profiles
  SET premium_trial_started_at = coalesce(premium_trial_started_at, now()),
      premium_trial_ends_at = p_trial_ends_at,
      updated_at = now()
  WHERE id = p_user_id;

  PERFORM public.admin_record_audit_event(
    'premium_trial_override',
    'user'::public.admin_audit_entity_type,
    p_user_id,
    btrim(p_reason),
    'premium-trial:' || btrim(p_idempotency_key),
    jsonb_build_object(
      'before_trial_ends_at', v_before,
      'after_trial_ends_at', p_trial_ends_at
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_username(
  p_user_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_prev text;
BEGIN
  PERFORM public.admin_require_permission('users');

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING errcode = '22023';
  END IF;

  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'a reason of at least 10 characters is required' USING errcode = '22023';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  SELECT p.username::text INTO v_prev
  FROM public.profiles p
  WHERE p.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found' USING errcode = 'P0002';
  END IF;

  UPDATE public.profiles
  SET username = NULL,
      updated_at = now()
  WHERE id = p_user_id;

  PERFORM public.admin_record_audit_event(
    'username_cleared',
    'user'::public.admin_audit_entity_type,
    p_user_id,
    btrim(p_reason),
    'username-clear:' || btrim(p_idempotency_key),
    jsonb_build_object('previous_username', v_prev)
  );
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
  v_perms jsonb;
  v_admin uuid;
  v_rep public.user_reputation%rowtype;
  v_capacity integer;
BEGIN
  v_perms := public.admin_require_permission('users');
  IF (v_perms->>'role')::text <> 'super_admin' THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

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
  v_reputation jsonb;
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
    'username', p.username::text,
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
    'is_onboarded', p.display_name IS NOT NULL,
    'premium_trial_started_at', p.premium_trial_started_at,
    'premium_trial_ends_at', p.premium_trial_ends_at,
    'premium_active', p.premium_trial_ends_at IS NOT NULL AND p.premium_trial_ends_at > now()
  )
  INTO v_profile
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_user_id;

  SELECT jsonb_build_object(
    'points_main', ur.points_main,
    'shield_remaining', ur.shield_remaining,
    'crown_public', ur.crown_public,
    'tier', public.crown_tier_for_points(ur.points_main)
  )
  INTO v_reputation
  FROM public.user_reputation ur
  WHERE ur.user_id = p_user_id;

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
    'reputation', coalesce(v_reputation, '{}'::jsonb),
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
      ),
      'projects_created', (SELECT count(*) FROM public.projects pr WHERE pr.creator_id = p_user_id)
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

REVOKE ALL ON FUNCTION public.admin_list_projects(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_projects(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_projects(text, text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_get_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_project(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_list_project_disputes(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_project_disputes(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_project_disputes(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_override_premium_trial(uuid, timestamptz, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_override_premium_trial(uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_override_premium_trial(uuid, timestamptz, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_clear_username(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_clear_username(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_username(uuid, text, text) TO service_role;