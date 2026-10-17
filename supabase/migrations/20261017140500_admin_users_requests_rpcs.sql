-- Admin user detail, restrictions, notes, and request directory RPCs.

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

REVOKE ALL ON FUNCTION public.admin_get_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_suspend_user(
  p_user_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.admin_require_permission('users');

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING errcode = '22023';
  END IF;

  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'a reason of at least 10 characters is required' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id) THEN
    RAISE EXCEPTION 'user not found' USING errcode = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_account_restrictions r
    WHERE r.user_id = p_user_id
      AND r.lifted_at IS NULL
      AND r.scope = 'new_marketplace_listings'::public.user_restriction_scope
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.user_account_restrictions (
    user_id,
    scope,
    reason,
    created_by,
    idempotency_key
  )
  VALUES (
    p_user_id,
    'new_marketplace_listings'::public.user_restriction_scope,
    btrim(p_reason),
    auth.uid(),
    p_idempotency_key
  );

  PERFORM public.admin_record_audit_event(
    'user_suspended',
    'user'::public.admin_audit_entity_type,
    p_user_id,
    btrim(p_reason),
    'audit:' || p_idempotency_key,
    jsonb_build_object(
      'scope', 'new_marketplace_listings',
      'scope_description', 'Blocks new requests and new offers only'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_suspend_user(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_reinstate_user(
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
  v_updated integer;
BEGIN
  PERFORM public.admin_require_permission('users');

  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'a reason of at least 10 characters is required' USING errcode = '22023';
  END IF;

  UPDATE public.user_account_restrictions r
  SET
    lifted_at = now(),
    lifted_by = auth.uid(),
    lift_reason = btrim(p_reason)
  WHERE r.user_id = p_user_id
    AND r.lifted_at IS NULL
    AND r.scope = 'new_marketplace_listings'::public.user_restriction_scope;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN;
  END IF;

  PERFORM public.admin_record_audit_event(
    'user_reinstated',
    'user'::public.admin_audit_entity_type,
    p_user_id,
    btrim(p_reason),
    'audit:' || p_idempotency_key,
    jsonb_build_object('scope', 'new_marketplace_listings')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reinstate_user(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reinstate_user(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reinstate_user(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_add_user_note(
  p_user_id uuid,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.admin_require_permission('users');

  IF p_body IS NULL OR char_length(btrim(p_body)) < 3 THEN
    RAISE EXCEPTION 'note is too short' USING errcode = '22023';
  END IF;

  INSERT INTO public.admin_user_notes (user_id, author_admin_id, body)
  VALUES (p_user_id, auth.uid(), btrim(p_body))
  RETURNING id INTO v_id;

  PERFORM public.admin_record_audit_event(
    'user_note_added',
    'user'::public.admin_audit_entity_type,
    p_user_id,
    NULL,
    'note:' || v_id::text,
    jsonb_build_object('note_id', v_id)
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_user_note(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_user_note(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_user_note(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_list_requests(
  p_query text DEFAULT '',
  p_status_group text DEFAULT 'all',
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
  v_items jsonb;
  v_total bigint;
  v_q text := btrim(coalesce(p_query, ''));
BEGIN
  PERFORM public.admin_require_permission('requests');

  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'limit must be between 1 and 100' USING errcode = '22023';
  END IF;

  SELECT count(*)::bigint
  INTO v_total
  FROM public.requests r
  INNER JOIN public.profiles p ON p.id = r.requester_id
  WHERE (
    v_q = ''
    OR r.title ILIKE '%' || v_q || '%'
    OR r.id::text ILIKE '%' || v_q || '%'
    OR p.display_name ILIKE '%' || v_q || '%'
  )
  AND (
    p_status_group = 'all'
    OR (p_status_group = 'open' AND (
      public.request_effective_status(r.status, r.expires_at) = 'awaiting_review'::public.request_status
      OR public.request_effective_status(r.status, r.expires_at) = 'posted'::public.request_status
      OR r.status = 'draft'::public.request_status
    ))
    OR (p_status_group = 'engaged' AND r.status = ANY (ARRAY[
      'accepted'::public.request_status,
      'in_progress'::public.request_status,
      'completion_pending'::public.request_status,
      'disputed'::public.request_status
    ]))
    OR (p_status_group = 'completed' AND r.status = 'completed'::public.request_status)
    OR (p_status_group = 'closed' AND r.status = ANY (ARRAY[
      'cancelled'::public.request_status,
      'expired'::public.request_status,
      'no_show'::public.request_status
    ]))
    OR (p_status_group = 'disputed' AND r.status = 'disputed'::public.request_status)
  );

  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      r.id,
      r.title,
      left(coalesce(r.description, ''), 160) AS description_preview,
      r.requester_id,
      p.display_name AS requester_name,
      r.location_label,
      r.offered_amount,
      r.agreed_provider_amount,
      r.currency,
      public.request_effective_status(r.status, r.expires_at)::text AS status,
      r.payment_status::text AS payment_status,
      r.created_at,
      r.expires_at,
      r.selected_user_id,
      (SELECT count(*)::int FROM public.request_responses rr WHERE rr.request_id = r.id) AS offer_count,
      (SELECT count(*)::int FROM public.request_responses rr WHERE rr.request_id = r.id AND rr.status = 'pending'::public.response_status) AS pending_offer_count
    FROM public.requests r
    INNER JOIN public.profiles p ON p.id = r.requester_id
    WHERE (
      v_q = ''
      OR r.title ILIKE '%' || v_q || '%'
      OR r.id::text ILIKE '%' || v_q || '%'
      OR p.display_name ILIKE '%' || v_q || '%'
    )
    AND (
      p_status_group = 'all'
      OR (p_status_group = 'open' AND (
        public.request_effective_status(r.status, r.expires_at) = 'awaiting_review'::public.request_status
        OR public.request_effective_status(r.status, r.expires_at) = 'posted'::public.request_status
        OR r.status = 'draft'::public.request_status
      ))
      OR (p_status_group = 'engaged' AND r.status = ANY (ARRAY[
        'accepted'::public.request_status,
        'in_progress'::public.request_status,
        'completion_pending'::public.request_status,
        'disputed'::public.request_status
      ]))
      OR (p_status_group = 'completed' AND r.status = 'completed'::public.request_status)
      OR (p_status_group = 'closed' AND r.status = ANY (ARRAY[
        'cancelled'::public.request_status,
        'expired'::public.request_status,
        'no_show'::public.request_status
      ]))
      OR (p_status_group = 'disputed' AND r.status = 'disputed'::public.request_status)
    )
    ORDER BY r.created_at DESC
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

REVOKE ALL ON FUNCTION public.admin_list_requests(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_requests(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_requests(text, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_get_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_show_financial boolean;
  v_request jsonb;
BEGIN
  PERFORM public.admin_require_permission('requests');
  v_show_financial := coalesce((public.get_my_admin_permissions()->>'transactions')::boolean, false);

  IF NOT EXISTS (SELECT 1 FROM public.requests r WHERE r.id = p_request_id) THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'id', r.id,
    'title', r.title,
    'description', r.description,
    'requester_id', r.requester_id,
    'requester_name', rp.display_name,
    'selected_user_id', r.selected_user_id,
    'provider_name', pp.display_name,
    'location_label', r.location_label,
    'latitude', extensions.ST_Y(r.location::extensions.geometry),
    'longitude', extensions.ST_X(r.location::extensions.geometry),
    'offered_amount', r.offered_amount,
    'agreed_provider_amount', r.agreed_provider_amount,
    'currency', r.currency,
    'status', public.request_effective_status(r.status, r.expires_at)::text,
    'stored_status', r.status::text,
    'payment_status', r.payment_status::text,
    'created_at', r.created_at,
    'submitted_at', r.submitted_at,
    'expires_at', r.expires_at,
    'accepted_at', r.accepted_at,
    'started_at', r.started_at,
    'completed_at', r.completed_at,
    'cancelled_at', r.cancelled_at,
    'completion_confirm_by', r.completion_confirm_by
  )
  INTO v_request
  FROM public.requests r
  INNER JOIN public.profiles rp ON rp.id = r.requester_id
  LEFT JOIN public.profiles pp ON pp.id = r.selected_user_id
  WHERE r.id = p_request_id;

  RETURN jsonb_build_object(
    'request', v_request,
    'offers', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT
          rr.id,
          rr.responder_id,
          p.display_name AS responder_name,
          rr.message,
          rr.quoted_amount,
          rr.status::text AS status,
          rr.distance_m,
          rr.created_at,
          rr.resolved_at,
          rr.decline_reason
        FROM public.request_responses rr
        INNER JOIN public.profiles p ON p.id = rr.responder_id
        WHERE rr.request_id = p_request_id
        ORDER BY rr.created_at DESC
      ) x
    ), '[]'::jsonb),
    'handshake', (
      SELECT row_to_json(h)
      FROM public.handshakes h
      WHERE h.request_id = p_request_id
      LIMIT 1
    ),
    'status_events', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at ASC)
      FROM (
        SELECT e.id, e.actor_id, e.from_status::text, e.to_status::text, e.created_at
        FROM public.request_status_events e
        WHERE e.request_id = p_request_id
        ORDER BY e.created_at ASC
      ) x
    ), '[]'::jsonb),
    'messages', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at ASC)
      FROM (
        SELECT
          m.id,
          m.sender_id,
          sp.display_name AS sender_name,
          m.body,
          m.created_at,
          m.read_at
        FROM public.request_conversations c
        INNER JOIN public.request_messages m ON m.conversation_id = c.id
        LEFT JOIN public.profiles sp ON sp.id = m.sender_id
        WHERE c.request_id = p_request_id
        ORDER BY m.created_at ASC
        LIMIT 200
      ) x
    ), '[]'::jsonb),
    'service_problems', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT
          sp.id,
          sp.kind::text AS kind,
          sp.status,
          sp.resolution,
          sp.reported_by,
          sp.description,
          sp.respond_by,
          sp.created_at,
          sp.resolved_at
        FROM public.service_problems sp
        WHERE sp.request_id = p_request_id
        ORDER BY sp.created_at DESC
      ) x
    ), '[]'::jsonb),
    'admin_resolutions', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT dar.id, dar.outcome, dar.admin_note, dar.created_at
        FROM public.dispute_admin_resolutions dar
        WHERE dar.request_id = p_request_id
        ORDER BY dar.created_at DESC
      ) x
    ), '[]'::jsonb),
    'payment_lock', (
      SELECT row_to_json(pl)
      FROM (
        SELECT
          pl.request_id,
          pl.status::text AS status,
          pl.provider_amount,
          pl.service_fee,
          pl.total,
          pl.bucket::text AS escrow_bucket,
          pl.created_at,
          pl.updated_at
        FROM public.payment_locks pl
        WHERE pl.request_id = p_request_id
      ) pl
    ),
    'wallet_transactions', CASE
      WHEN v_show_financial THEN coalesce((
        SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
        FROM (
          SELECT wt.id, wt.type::text AS type, wt.status::text AS status, wt.amount, wt.created_at
          FROM public.wallet_transactions wt
          WHERE wt.request_id = p_request_id
          ORDER BY wt.created_at DESC
        ) x
      ), '[]'::jsonb)
      ELSE NULL
    END,
    'audit_events', coalesce((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT a.id, a.action, a.reason, a.metadata, a.created_at
        FROM public.admin_audit_events a
        WHERE a.entity_type = 'request'::public.admin_audit_entity_type
          AND a.entity_id = p_request_id
        ORDER BY a.created_at DESC
        LIMIT 20
      ) x
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_request(uuid) TO service_role;
