-- Admin report queue, detail, and investigation RPCs (service_problems).

CREATE OR REPLACE FUNCTION public.admin_report_queue_label(
  p_sp_status text,
  p_respond_by timestamptz,
  p_inv_queue text,
  p_inv_assigned uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN p_sp_status = 'resolved' THEN 'resolved'
    WHEN p_inv_queue = 'escalated' THEN 'escalated'
    WHEN p_inv_queue = 'awaiting_info' THEN 'awaiting_info'
    WHEN p_inv_queue = 'under_review' THEN 'under_review'
    WHEN p_respond_by IS NOT NULL AND p_respond_by > now() THEN 'awaiting_counterparty'
    WHEN p_inv_assigned IS NULL THEN 'new'
    ELSE 'under_review'
  END;
$$;

CREATE OR REPLACE FUNCTION public.admin_report_filter_matches(
  p_sp_status text,
  p_respond_by timestamptz,
  p_inv_assigned uuid,
  p_inv_queue text,
  p_actor uuid,
  p_filter text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT CASE coalesce(btrim(p_filter), 'all')
    WHEN 'all' THEN true
    WHEN 'resolved' THEN p_sp_status = 'resolved'
    WHEN 'open' THEN p_sp_status = 'open'
    WHEN 'new' THEN p_sp_status = 'open'
      AND p_inv_assigned IS NULL
      AND coalesce(p_inv_queue, 'triage') = 'triage'
    WHEN 'under_review' THEN p_sp_status = 'open'
      AND coalesce(p_inv_queue, 'triage') = 'under_review'
    WHEN 'awaiting_info' THEN p_sp_status = 'open'
      AND p_inv_queue = 'awaiting_info'
    WHEN 'escalated' THEN p_sp_status = 'open'
      AND p_inv_queue = 'escalated'
    WHEN 'awaiting_counterparty' THEN p_sp_status = 'open'
      AND p_respond_by IS NOT NULL
      AND p_respond_by > now()
    WHEN 'assigned_to_me' THEN p_sp_status = 'open'
      AND p_inv_assigned = p_actor
    ELSE true
  END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_reports(
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
  v_total integer;
  v_items jsonb;
  v_actor uuid := auth.uid();
BEGIN
  PERFORM public.admin_require_permission('reports');

  SELECT count(*)::int
  INTO v_total
  FROM public.service_problems sp
  INNER JOIN public.requests r ON r.id = sp.request_id
  INNER JOIN public.profiles reporter ON reporter.id = sp.reported_by
  LEFT JOIN public.profiles provider ON provider.id = r.selected_user_id
  LEFT JOIN public.service_problem_investigations inv ON inv.service_problem_id = sp.id
  WHERE (
    v_q = ''
    OR sp.id::text ILIKE '%' || v_q || '%'
    OR r.id::text ILIKE '%' || v_q || '%'
    OR r.title ILIKE '%' || v_q || '%'
    OR reporter.display_name ILIKE '%' || v_q || '%'
    OR provider.display_name ILIKE '%' || v_q || '%'
  )
  AND public.admin_report_filter_matches(
    sp.status,
    sp.respond_by,
    inv.assigned_admin_id,
    inv.queue_status::text,
    v_actor,
    p_filter
  );

  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      sp.id,
      sp.kind::text AS kind,
      sp.status,
      sp.resolution,
      sp.description,
      sp.created_at,
      sp.resolved_at,
      sp.respond_by,
      sp.reported_by,
      reporter.display_name AS reporter_name,
      r.id AS request_id,
      r.title AS request_title,
      r.requester_id,
      r.selected_user_id AS provider_id,
      provider.display_name AS provider_name,
      inv.assigned_admin_id,
      coalesce(inv.queue_status::text, 'triage') AS queue_status,
      public.admin_report_queue_label(
        sp.status,
        sp.respond_by,
        inv.queue_status::text,
        inv.assigned_admin_id
      ) AS queue_label
    FROM public.service_problems sp
    INNER JOIN public.requests r ON r.id = sp.request_id
    INNER JOIN public.profiles reporter ON reporter.id = sp.reported_by
    LEFT JOIN public.profiles provider ON provider.id = r.selected_user_id
    LEFT JOIN public.service_problem_investigations inv ON inv.service_problem_id = sp.id
    WHERE (
      v_q = ''
      OR sp.id::text ILIKE '%' || v_q || '%'
      OR r.id::text ILIKE '%' || v_q || '%'
      OR r.title ILIKE '%' || v_q || '%'
      OR reporter.display_name ILIKE '%' || v_q || '%'
      OR provider.display_name ILIKE '%' || v_q || '%'
    )
    AND public.admin_report_filter_matches(
      sp.status,
      sp.respond_by,
      inv.assigned_admin_id,
      inv.queue_status::text,
      v_actor,
      p_filter
    )
    ORDER BY sp.created_at DESC
    LIMIT greatest(1, least(p_limit, 100))
    OFFSET greatest(0, p_offset)
  ) t;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', greatest(1, least(p_limit, 100)),
    'offset', greatest(0, p_offset),
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_report(p_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_show_financial boolean;
  v_show_phone boolean;
  v_problem jsonb;
  v_request_id uuid;
  v_reported_by uuid;
BEGIN
  PERFORM public.admin_require_permission('reports');
  v_show_financial := coalesce((public.get_my_admin_permissions()->>'transactions')::boolean, false);
  v_show_phone := coalesce((public.get_my_admin_permissions()->>'users')::boolean, false);

  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'report_id is required' USING errcode = '22023';
  END IF;

  SELECT sp.request_id, sp.reported_by
  INTO v_request_id, v_reported_by
  FROM public.service_problems sp
  WHERE sp.id = p_report_id;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'report not found' USING errcode = 'P0002';
  END IF;

  PERFORM public.admin_record_audit_event(
    'report_view',
    'service_problem'::public.admin_audit_entity_type,
    p_report_id,
    NULL,
    'report-view:' || p_report_id::text || ':' || auth.uid()::text || ':' || to_char(now(), 'YYYYMMDDHH24'),
    jsonb_build_object('includes_evidence', true)
  );

  SELECT jsonb_build_object(
    'id', sp.id,
    'kind', sp.kind::text,
    'status', sp.status,
    'resolution', sp.resolution,
    'description', sp.description,
    'evidence_paths', sp.evidence_paths,
    'reported_by', sp.reported_by,
    'status_before', sp.status_before::text,
    'payment_before', sp.payment_before::text,
    'respond_by', sp.respond_by,
    'created_at', sp.created_at,
    'resolved_at', sp.resolved_at,
    'queue_status', coalesce(inv.queue_status::text, 'triage'),
    'queue_label', public.admin_report_queue_label(
      sp.status,
      sp.respond_by,
      inv.queue_status::text,
      inv.assigned_admin_id
    ),
    'assigned_admin_id', inv.assigned_admin_id
  )
  INTO v_problem
  FROM public.service_problems sp
  LEFT JOIN public.service_problem_investigations inv ON inv.service_problem_id = sp.id
  WHERE sp.id = p_report_id;

  RETURN jsonb_build_object(
    'report', v_problem,
    'request', (
      SELECT jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'description', r.description,
        'status', public.request_effective_status(r.status, r.expires_at)::text,
        'stored_status', r.status::text,
        'payment_status', r.payment_status::text,
        'requester_id', r.requester_id,
        'requester_name', rp.display_name,
        'provider_id', r.selected_user_id,
        'provider_name', pp.display_name,
        'location_label', r.location_label,
        'offered_amount', r.offered_amount,
        'agreed_provider_amount', r.agreed_provider_amount,
        'currency', r.currency,
        'created_at', r.created_at,
        'accepted_at', r.accepted_at,
        'completed_at', r.completed_at
      )
      FROM public.requests r
      INNER JOIN public.profiles rp ON rp.id = r.requester_id
      LEFT JOIN public.profiles pp ON pp.id = r.selected_user_id
      WHERE r.id = v_request_id
    ),
    'parties', coalesce((
      SELECT jsonb_agg(row_to_json(x))
      FROM (
        SELECT
          p.id,
          p.display_name,
          CASE WHEN v_show_phone THEN u.phone ELSE NULL END AS phone,
          u.phone_confirmed_at IS NOT NULL AS phone_confirmed,
          CASE
            WHEN p.id = r.requester_id THEN 'requester'
            WHEN p.id = r.selected_user_id THEN 'provider'
            WHEN p.id = v_reported_by THEN 'reporter'
            ELSE 'other'
          END AS role
        FROM public.requests r
        INNER JOIN public.profiles p ON p.id IN (r.requester_id, r.selected_user_id, v_reported_by)
        LEFT JOIN auth.users u ON u.id = p.id
        WHERE r.id = v_request_id
      ) x
    ), '[]'::jsonb),
    'status_events', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at ASC)
      FROM (
        SELECT e.id, e.actor_id, e.from_status::text, e.to_status::text, e.created_at
        FROM public.request_status_events e
        WHERE e.request_id = v_request_id
        ORDER BY e.created_at ASC
        LIMIT 100
      ) x
    ), '[]'::jsonb),
    'messages', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at ASC)
      FROM (
        SELECT
          m.id,
          m.sender_id,
          sender.display_name AS sender_name,
          m.body,
          m.created_at
        FROM public.request_conversations c
        INNER JOIN public.request_messages m ON m.conversation_id = c.id
        LEFT JOIN public.profiles sender ON sender.id = m.sender_id
        WHERE c.request_id = v_request_id
        ORDER BY m.created_at ASC
        LIMIT 200
      ) x
    ), '[]'::jsonb),
    'related_reports', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT
          sp2.id,
          sp2.kind::text AS kind,
          sp2.status,
          sp2.resolution,
          sp2.created_at,
          sp2.resolved_at
        FROM public.service_problems sp2
        WHERE sp2.request_id = v_request_id
          AND sp2.id <> p_report_id
        ORDER BY sp2.created_at DESC
        LIMIT 10
      ) x
    ), '[]'::jsonb),
    'admin_resolutions', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT dar.id, dar.outcome, dar.admin_note, dar.created_at
        FROM public.dispute_admin_resolutions dar
        WHERE dar.service_problem_id = p_report_id
        ORDER BY dar.created_at DESC
      ) x
    ), '[]'::jsonb),
    'notes', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT n.id, n.body, n.author_admin_id, n.created_at
        FROM public.admin_service_problem_notes n
        WHERE n.service_problem_id = p_report_id
        ORDER BY n.created_at DESC
        LIMIT 50
      ) x
    ), '[]'::jsonb),
    'audit_events', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT a.id, a.action, a.reason, a.metadata, a.actor_admin_id, a.created_at
        FROM public.admin_audit_events a
        WHERE a.entity_type = 'service_problem'::public.admin_audit_entity_type
          AND a.entity_id = p_report_id
        ORDER BY a.created_at DESC
        LIMIT 40
      ) x
    ), '[]'::jsonb),
    'assignable_admins', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.email NULLS LAST)
      FROM (
        SELECT am.user_id, u.email
        FROM public.admin_members am
        INNER JOIN auth.users u ON u.id = am.user_id
        WHERE am.role IN (
          'super_admin'::public.admin_role,
          'support_admin'::public.admin_role
        )
      ) x
    ), '[]'::jsonb),
    'payment_lock', (
      SELECT row_to_json(pl)
      FROM (
        SELECT
          pl.status::text AS status,
          pl.provider_amount,
          pl.service_fee,
          pl.total,
          pl.bucket::text AS escrow_bucket,
          pl.updated_at
        FROM public.payment_locks pl
        WHERE pl.request_id = v_request_id
      ) pl
    ),
    'wallet_transactions', CASE
      WHEN v_show_financial THEN coalesce((
        SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
        FROM (
          SELECT wt.id, wt.type::text AS type, wt.status::text AS status, wt.amount, wt.created_at
          FROM public.wallet_transactions wt
          WHERE wt.request_id = v_request_id
          ORDER BY wt.created_at DESC
        ) x
      ), '[]'::jsonb)
      ELSE NULL
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_report(
  p_report_id uuid,
  p_admin_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_problem public.service_problems%rowtype;
BEGIN
  PERFORM public.admin_require_permission('reports');

  SELECT * INTO v_problem
  FROM public.service_problems sp
  WHERE sp.id = p_report_id;

  IF v_problem.id IS NULL THEN
    RAISE EXCEPTION 'report not found' USING errcode = 'P0002';
  END IF;

  IF v_problem.status <> 'open' THEN
    RAISE EXCEPTION 'only open reports can be assigned' USING errcode = '55000';
  END IF;

  IF p_admin_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.admin_members am
       WHERE am.user_id = p_admin_id
         AND am.role IN ('super_admin'::public.admin_role, 'support_admin'::public.admin_role)
     ) THEN
    RAISE EXCEPTION 'assignee must be a support administrator' USING errcode = '22023';
  END IF;

  PERFORM public.admin_upsert_service_problem_investigation(
    p_report_id,
    p_admin_id,
    CASE
      WHEN p_admin_id IS NULL THEN 'triage'::public.service_problem_investigation_status
      ELSE 'under_review'::public.service_problem_investigation_status
    END
  );

  PERFORM public.admin_record_audit_event(
    'report_assign',
    'service_problem'::public.admin_audit_entity_type,
    p_report_id,
    NULL,
    'report-assign:' || p_report_id::text || ':' || coalesce(p_admin_id::text, 'none') || ':' || auth.uid()::text,
    jsonb_build_object('assigned_admin_id', p_admin_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_report_investigation(
  p_report_id uuid,
  p_queue_status public.service_problem_investigation_status,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_problem public.service_problems%rowtype;
  v_assignee uuid;
BEGIN
  PERFORM public.admin_require_permission('reports');

  SELECT * INTO v_problem
  FROM public.service_problems sp
  WHERE sp.id = p_report_id;

  IF v_problem.id IS NULL THEN
    RAISE EXCEPTION 'report not found' USING errcode = 'P0002';
  END IF;

  IF v_problem.status <> 'open' THEN
    RAISE EXCEPTION 'only open reports can be updated' USING errcode = '55000';
  END IF;

  IF p_queue_status = 'escalated'::public.service_problem_investigation_status
     AND (p_reason IS NULL OR char_length(btrim(p_reason)) < 10) THEN
    RAISE EXCEPTION 'escalation requires a reason of at least 10 characters' USING errcode = '22023';
  END IF;

  SELECT inv.assigned_admin_id
  INTO v_assignee
  FROM public.service_problem_investigations inv
  WHERE inv.service_problem_id = p_report_id;

  PERFORM public.admin_upsert_service_problem_investigation(
    p_report_id,
    v_assignee,
    p_queue_status
  );

  PERFORM public.admin_record_audit_event(
    'report_investigation_status',
    'service_problem'::public.admin_audit_entity_type,
    p_report_id,
    CASE WHEN p_reason IS NULL THEN NULL ELSE btrim(p_reason) END,
    'report-status:' || p_report_id::text || ':' || p_queue_status::text || ':' || auth.uid()::text || ':' || floor(extract(epoch from now()))::text,
    jsonb_build_object('queue_status', p_queue_status::text)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_report_note(
  p_report_id uuid,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  PERFORM public.admin_require_permission('reports');

  IF p_body IS NULL OR char_length(btrim(p_body)) < 3 THEN
    RAISE EXCEPTION 'note must be at least 3 characters' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.service_problems sp WHERE sp.id = p_report_id) THEN
    RAISE EXCEPTION 'report not found' USING errcode = 'P0002';
  END IF;

  INSERT INTO public.admin_service_problem_notes (service_problem_id, author_admin_id, body)
  VALUES (p_report_id, v_actor, btrim(p_body));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_report(
  p_report_id uuid,
  p_outcome text,
  p_admin_note text,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.admin_require_permission('reports');

  IF p_admin_note IS NULL OR char_length(btrim(p_admin_note)) < 10 THEN
    RAISE EXCEPTION 'findings note must be at least 10 characters' USING errcode = '22023';
  END IF;

  PERFORM public.admin_record_audit_event(
    'report_resolve',
    'service_problem'::public.admin_audit_entity_type,
    p_report_id,
    btrim(p_admin_note),
    'report-resolve-audit:' || p_idempotency_key,
    jsonb_build_object('outcome', p_outcome)
  );

  PERFORM public.admin_resolve_service_problem(
    p_report_id,
    p_outcome,
    btrim(p_admin_note),
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_reports(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_reports(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_reports(text, text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.admin_get_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_report(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_assign_report(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_report(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_report(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_update_report_investigation(uuid, public.service_problem_investigation_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_report_investigation(uuid, public.service_problem_investigation_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_report_investigation(uuid, public.service_problem_investigation_status, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_add_report_note(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_report_note(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_report_note(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_resolve_report(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid, text, text, text) TO service_role;
