-- Tag-based request notification interests (user preferences, not request tags).

CREATE TABLE public.user_notification_tag_interests (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tag_id)
);

CREATE INDEX user_notification_tag_interests_tag_id_idx
  ON public.user_notification_tag_interests (tag_id);

ALTER TABLE public.user_notification_tag_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_notification_tag_interests_select_own
  ON public.user_notification_tag_interests
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT ON TABLE public.user_notification_tag_interests TO authenticated;
GRANT ALL ON TABLE public.user_notification_tag_interests TO service_role;

CREATE OR REPLACE FUNCTION public.list_notification_tag_interests()
RETURNS TABLE (
  tag_id uuid,
  name text,
  slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    t.id,
    t.name,
    t.slug
  FROM public.user_notification_tag_interests u
  JOIN public.tags t ON t.id = u.tag_id AND t.is_active
  WHERE u.user_id = public.assert_authenticated()
  ORDER BY t.name ASC;
$$;

GRANT ALL ON FUNCTION public.list_notification_tag_interests() TO authenticated;
GRANT ALL ON FUNCTION public.list_notification_tag_interests() TO service_role;

CREATE OR REPLACE FUNCTION public.set_notification_tag_interests(p_tag_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_distinct_ids uuid[];
  v_count integer;
  v_valid integer;
BEGIN
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
  INTO v_distinct_ids
  FROM unnest(coalesce(p_tag_ids, '{}'::uuid[])) AS u(x)
  WHERE x IS NOT NULL;

  v_count := coalesce(array_length(v_distinct_ids, 1), 0);

  IF v_count > 50 THEN
    RAISE EXCEPTION 'you may select at most 50 notification interests' USING errcode = '22023';
  END IF;

  DELETE FROM public.user_notification_tag_interests
  WHERE user_id = v_user_id;

  IF v_count = 0 THEN
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO v_valid
  FROM public.tags t
  WHERE t.id = ANY (v_distinct_ids)
    AND t.is_active;

  IF v_valid <> v_count THEN
    RAISE EXCEPTION 'one or more tags are invalid or inactive' USING errcode = '22023';
  END IF;

  INSERT INTO public.user_notification_tag_interests (user_id, tag_id)
  SELECT v_user_id, unnest(v_distinct_ids);
END;
$$;

GRANT ALL ON FUNCTION public.set_notification_tag_interests(uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.set_notification_tag_interests(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.notification_type_should_push(
  p_type public.notification_type
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT p_type = ANY (
    ARRAY[
      'response_received'::public.notification_type,
      'new_responses'::public.notification_type,
      'matching_request'::public.notification_type,
      'request_expiring'::public.notification_type,
      'request_expired'::public.notification_type,
      'response_accepted'::public.notification_type,
      'response_not_selected'::public.notification_type,
      'completion_requested'::public.notification_type,
      'payment_secured'::public.notification_type,
      'funds_returned'::public.notification_type,
      'payment_released'::public.notification_type,
      'payment_received'::public.notification_type,
      'withdrawal_processing'::public.notification_type,
      'withdrawal_successful'::public.notification_type,
      'withdrawal_failed'::public.notification_type,
      'new_message'::public.notification_type,
      'missed_call'::public.notification_type,
      'request_cancelled'::public.notification_type,
      'helper_cancelled'::public.notification_type,
      'problem_reported'::public.notification_type,
      'dispute_opened'::public.notification_type,
      'dispute_resolved'::public.notification_type,
      'funds_released_after_resolution'::public.notification_type,
      'rate_experience'::public.notification_type
    ]
  );
$$;

CREATE OR REPLACE FUNCTION public.notify_tag_interest_subscribers(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_requester_id uuid;
  v_title text;
  v_status public.request_status;
  v_payment public.payment_status;
  v_recipient_id uuid;
  v_body text;
BEGIN
  SELECT r.requester_id, r.title, r.status, r.payment_status
  INTO v_requester_id, v_title, v_status, v_payment
  FROM public.requests r
  WHERE r.id = p_request_id;

  IF v_requester_id IS NULL
     OR v_status <> 'posted'
     OR v_payment <> 'locked'::public.payment_status THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.request_tags rt WHERE rt.request_id = p_request_id
  ) THEN
    RETURN;
  END IF;

  v_body := format('"%s" matches your interests.', left(btrim(v_title), 120));

  FOR v_recipient_id IN
    SELECT DISTINCT u.user_id
    FROM public.user_notification_tag_interests u
    INNER JOIN public.request_tags rt
      ON rt.request_id = p_request_id
     AND rt.tag_id = u.tag_id
    WHERE u.user_id <> v_requester_id
  LOOP
    PERFORM public.create_notification(
      v_recipient_id,
      'request:' || p_request_id::text || ':tag_interest',
      'matching_request'::public.notification_type,
      'Request you might want',
      v_body,
      format('/respond/%s', p_request_id),
      p_request_id,
      NULL,
      NULL,
      NULL,
      v_requester_id,
      NULL,
      true
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_tag_interest_subscribers(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_tag_interest_subscribers(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.create_request(
  p_title text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_scheduled_for timestamp with time zone DEFAULT NULL,
  p_offered_amount numeric DEFAULT NULL,
  p_source_request_id uuid DEFAULT NULL,
  p_attachment_path text DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_location extensions.geography := public.assert_coordinates(p_latitude, p_longitude);
  v_description text := nullif(btrim(p_description), '');
  v_request_id uuid;
  v_source public.requests%rowtype;
BEGIN
  IF char_length(btrim(p_title)) < 3 OR char_length(btrim(p_title)) > 120 THEN
    RAISE EXCEPTION 'title must be between 3 and 120 characters' USING errcode = '22023';
  END IF;

  IF v_description IS NULL
     OR char_length(v_description) < 1
     OR char_length(v_description) > 1000 THEN
    RAISE EXCEPTION 'description must be between 1 and 1000 characters' USING errcode = '22023';
  END IF;

  IF p_offered_amount IS NULL OR p_offered_amount <= 0 THEN
    RAISE EXCEPTION 'offer amount must be greater than zero' USING errcode = '22023';
  END IF;

  IF p_scheduled_for IS NOT NULL AND p_scheduled_for < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'scheduled time is in the past' USING errcode = '22023';
  END IF;

  IF p_scheduled_for IS NOT NULL AND p_scheduled_for > now() + interval '30 days' THEN
    RAISE EXCEPTION 'scheduled time is too far in the future' USING errcode = '22023';
  END IF;

  IF p_attachment_path IS NOT NULL THEN
    IF split_part(p_attachment_path, '/', 1) <> v_user_id::text
       OR split_part(p_attachment_path, '/', 2) <> 'drafts' THEN
      RAISE EXCEPTION 'invalid attachment path' USING errcode = '22023';
    END IF;
  END IF;

  IF p_source_request_id IS NOT NULL THEN
    SELECT * INTO v_source
    FROM public.requests
    WHERE id = p_source_request_id AND requester_id = v_user_id;

    IF v_source.id IS NULL THEN
      RAISE EXCEPTION 'source request not found' USING errcode = 'P0002';
    END IF;

    IF NOT (
      v_source.status = 'completed'
      OR v_source.status = 'expired'
      OR (v_source.status = 'posted' AND v_source.expires_at <= now())
    ) THEN
      RAISE EXCEPTION 'only expired or completed requests can be reused' USING errcode = '55000';
    END IF;
  END IF;

  IF (
    SELECT count(*) FROM public.requests
    WHERE requester_id = v_user_id
      AND (
        status IN ('accepted', 'in_progress', 'completion_pending')
        OR (status = 'posted' AND expires_at > now())
      )
  ) >= 5 THEN
    RAISE EXCEPTION 'you already have 5 open requests' USING errcode = '55000';
  END IF;

  PERFORM public.ensure_wallet_account(v_user_id);

  INSERT INTO public.requests (
    requester_id,
    title,
    description,
    scheduled_for,
    offered_amount,
    payment_status,
    location,
    location_label,
    status,
    submitted_at,
    expires_at,
    source_request_id,
    attachment_path
  )
  VALUES (
    v_user_id,
    btrim(p_title),
    v_description,
    p_scheduled_for,
    p_offered_amount,
    'not_required'::public.payment_status,
    v_location,
    btrim(p_location_label),
    'posted',
    now(),
    public.request_expires_at(p_scheduled_for),
    p_source_request_id,
    p_attachment_path
  )
  RETURNING id INTO v_request_id;

  PERFORM public.attach_tags_to_request(v_request_id, p_tag_ids);

  PERFORM public.lock_request_escrow(v_request_id, 'create:' || v_request_id::text);

  PERFORM public.notify_tag_interest_subscribers(v_request_id);

  RETURN v_request_id;
END;
$$;
