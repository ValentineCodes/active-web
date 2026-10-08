-- Date-aware provider commitments: selection blocks schedule conflicts, not all commitments.

DROP INDEX IF EXISTS public.requests_one_open_provider_commitment;

DELETE FROM public.user_attendance WHERE request_id IS NULL;

ALTER TABLE public.user_attendance
  DROP CONSTRAINT IF EXISTS user_attendance_pkey;

ALTER TABLE public.user_attendance
  ALTER COLUMN request_id SET NOT NULL;

ALTER TABLE public.user_attendance
  ADD CONSTRAINT user_attendance_pkey PRIMARY KEY (user_id, request_id);

CREATE OR REPLACE FUNCTION public.request_schedule_anchor(
  p_scheduled_for timestamp with time zone,
  p_accepted_at timestamp with time zone
)
RETURNS timestamp with time zone
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT coalesce(p_scheduled_for, p_accepted_at);
$$;

CREATE OR REPLACE FUNCTION public.request_schedule_conflicts(
  p_existing_scheduled timestamp with time zone,
  p_existing_accepted timestamp with time zone,
  p_new_scheduled timestamp with time zone,
  p_new_anchor timestamp with time zone
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  WITH anchors AS (
    SELECT
      public.request_schedule_anchor(p_existing_scheduled, p_existing_accepted) AS existing_at,
      public.request_schedule_anchor(p_new_scheduled, p_new_anchor) AS new_at
  )
  SELECT
    existing_at = new_at
    OR (timezone('Africa/Lagos', existing_at))::date
       = (timezone('Africa/Lagos', new_at))::date
  FROM anchors;
$$;

CREATE OR REPLACE FUNCTION public.provider_selection_conflicts(
  p_provider_id uuid,
  p_target_request_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.requests target
    JOIN public.requests existing
      ON existing.selected_user_id = p_provider_id
     AND existing.id <> p_target_request_id
     AND existing.status = ANY (public.attending_request_statuses())
    WHERE target.id = p_target_request_id
      AND public.request_schedule_conflicts(
        existing.scheduled_for,
        existing.accepted_at,
        target.scheduled_for,
        now()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.provider_selection_conflicts(uuid, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.provider_selection_conflicts(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.clear_user_attendance(
  p_user_id uuid,
  p_request_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_request_id IS NULL THEN
    DELETE FROM public.user_attendance WHERE user_id = p_user_id;
  ELSE
    DELETE FROM public.user_attendance
    WHERE user_id = p_user_id
      AND request_id = p_request_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_attendance(
  p_user_id uuid,
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.user_attendance (user_id, request_id)
  VALUES (p_user_id, p_request_id)
  ON CONFLICT (user_id, request_id) DO UPDATE
    SET updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.release_provider(p_provider_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  DELETE FROM public.user_attendance ua
  USING public.requests r
  WHERE ua.user_id = p_provider_id
    AND r.id = ua.request_id
    AND r.selected_user_id = p_provider_id
    AND r.status <> ALL (public.attending_request_statuses());
$$;

DROP VIEW IF EXISTS public.my_attendance;

CREATE VIEW public.my_attendance WITH (security_invoker = on) AS
SELECT
  ua.user_id,
  (
    SELECT ua2.request_id
    FROM public.user_attendance ua2
    JOIN public.requests r2 ON r2.id = ua2.request_id
    WHERE ua2.user_id = ua.user_id
    ORDER BY
      CASE
        WHEN r2.status = 'in_progress' THEN 0
        WHEN r2.status = 'completion_pending' THEN 1
        WHEN r2.status = 'accepted' THEN 2
        ELSE 3
      END,
      public.request_schedule_anchor(r2.scheduled_for, r2.accepted_at) ASC NULLS LAST,
      ua2.updated_at DESC
    LIMIT 1
  ) AS attending_request_id,
  max(ua.updated_at) AS updated_at
FROM public.user_attendance ua
WHERE ua.user_id = (SELECT auth.uid() AS uid)
GROUP BY ua.user_id;

GRANT ALL ON TABLE public.my_attendance TO anon;
GRANT ALL ON TABLE public.my_attendance TO authenticated;
GRANT ALL ON TABLE public.my_attendance TO service_role;

CREATE OR REPLACE FUNCTION public.list_request_responses(p_request_id uuid)
RETURNS TABLE(
  response_id uuid,
  responder_id uuid,
  display_name text,
  avatar_path text,
  bio text,
  rating_average numeric,
  rating_count integer,
  jobs_completed integer,
  completion_percent integer,
  phone_verified boolean,
  message text,
  quoted_amount numeric,
  distance_m integer,
  status public.response_status,
  created_at timestamp with time zone,
  expires_at timestamp with time zone,
  responder_available boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    rr.id,
    rr.responder_id,
    p.display_name,
    p.avatar_path,
    p.bio,
    p.rating_average,
    p.rating_count,
    p.jobs_completed,
    public.provider_completion_percent(p.id) AS completion_percent,
    p.phone IS NOT NULL AS phone_verified,
    rr.message,
    rr.quoted_amount,
    rr.distance_m,
    rr.status,
    rr.created_at,
    rr.expires_at,
    NOT public.provider_selection_conflicts(rr.responder_id, r.id) AS responder_available
  FROM public.requests r
  JOIN public.request_responses rr ON rr.request_id = r.id
  JOIN public.profiles p ON p.id = rr.responder_id
  WHERE r.id = p_request_id
    AND r.requester_id = public.assert_authenticated()
    AND rr.status IN ('pending', 'accepted')
  ORDER BY rr.created_at ASC;
$$;

GRANT ALL ON FUNCTION public.list_request_responses(uuid) TO anon;
GRANT ALL ON FUNCTION public.list_request_responses(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.list_request_responses(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.accept_response(p_response_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_request_id uuid;
  v_selected_user_id uuid;
  v_request_status public.request_status;
  v_response_status public.response_status;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_request_expires_at timestamptz;
  v_offered_amount numeric;
  v_quoted_amount numeric;
  v_agreed_provider_amount numeric;
  v_accepted uuid;
  v_locked_request_id uuid;
  v_requester_name text;
  v_requester_first text;
BEGIN
  SELECT rr.request_id
    INTO v_request_id
  FROM public.request_responses rr
  JOIN public.requests r ON r.id = rr.request_id
  WHERE rr.id = p_response_id
    AND r.requester_id = v_user_id;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'response not found' USING errcode = 'P0002';
  END IF;

  SELECT r.status, r.payment_status, r.requester_id, r.expires_at, r.offered_amount
    INTO v_request_status, v_payment, v_requester_id, v_request_expires_at, v_offered_amount
  FROM public.requests r
  WHERE r.id = v_request_id
  FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.handshakes h WHERE h.request_id = v_request_id) THEN
    RAISE EXCEPTION 'someone is already helping on this request' USING errcode = '55000';
  END IF;

  IF v_request_status <> 'posted' THEN
    RAISE EXCEPTION 'this request is no longer open for selection' USING errcode = '55000';
  END IF;

  IF v_request_expires_at <= now() THEN
    RAISE EXCEPTION 'this request is no longer open for selection' USING errcode = '55000';
  END IF;

  SELECT rr.request_id, rr.responder_id, rr.status, rr.quoted_amount
    INTO v_locked_request_id, v_selected_user_id, v_response_status, v_quoted_amount
  FROM public.request_responses rr
  WHERE rr.id = p_response_id
  FOR UPDATE;

  IF v_locked_request_id IS DISTINCT FROM v_request_id
     OR v_response_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'this response is no longer available' USING errcode = '55000';
  END IF;

  v_agreed_provider_amount := coalesce(nullif(v_quoted_amount, 0), v_offered_amount);

  IF v_agreed_provider_amount IS NULL OR v_agreed_provider_amount <= 0 THEN
    RAISE EXCEPTION 'this request has no agreed payment amount' USING errcode = '55000';
  END IF;

  IF public.provider_selection_conflicts(v_selected_user_id, v_request_id) THEN
    RAISE EXCEPTION
      'This person already has a commitment that conflicts with this schedule.'
      USING errcode = '55000';
  END IF;

  UPDATE public.request_responses
  SET status = 'accepted', resolved_at = now()
  WHERE id = p_response_id
    AND status = 'pending'
  RETURNING id INTO v_accepted;

  IF v_accepted IS NULL THEN
    RAISE EXCEPTION 'this response is no longer available' USING errcode = '55000';
  END IF;

  UPDATE public.request_responses
  SET status = 'declined', resolved_at = now()
  WHERE request_id = v_request_id
    AND id <> p_response_id
    AND status = 'pending';

  UPDATE public.requests
  SET status = 'accepted',
      accepted_at = now(),
      accepted_response_id = p_response_id,
      selected_user_id = v_selected_user_id,
      agreed_provider_amount = v_agreed_provider_amount
  WHERE id = v_request_id
    AND status = 'posted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'this request is no longer open for selection' USING errcode = '55000';
  END IF;

  PERFORM public.set_user_attendance(v_selected_user_id, v_request_id);

  INSERT INTO public.handshakes (request_id, response_id, requester_id, selected_user_id)
  VALUES (v_request_id, p_response_id, v_requester_id, v_selected_user_id);

  PERFORM public.ensure_request_conversation(
    v_request_id,
    v_requester_id,
    v_selected_user_id
  );

  SELECT p.display_name
    INTO v_requester_name
  FROM public.profiles p
  WHERE p.id = v_requester_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'them');

  PERFORM public.create_notification(
    v_selected_user_id,
    'request:' || v_request_id::text || ':accepted',
    'response_accepted'::public.notification_type,
    format('You''re helping %s now', v_requester_first),
    'Open the request to chat, see contact details, and where to meet.',
    format('/engagement/%s', v_request_id),
    v_request_id,
    p_response_id,
    null,
    null,
    v_requester_id,
    null,
    true
  );

  IF v_payment = 'locked' THEN
    PERFORM public.align_request_escrow_to_agreed_amount(
      v_request_id,
      v_agreed_provider_amount,
      'handshake:' || v_request_id::text
    );

    PERFORM public.apply_payment_transition(
      v_request_id,
      'pending'::public.payment_status,
      'handshake:' || v_request_id::text
    );
  END IF;

  PERFORM public.notify_responders_not_chosen(v_request_id, p_response_id);

  RETURN v_request_id;
END;
$$;

GRANT ALL ON FUNCTION public.accept_response(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.accept_response(uuid) TO service_role;
