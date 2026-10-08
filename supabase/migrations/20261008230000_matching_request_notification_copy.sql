-- matching_request inbox/push copy and per-recipient bodies from explicit tags + request title.

CREATE OR REPLACE FUNCTION public.matching_request_notification_body(
  p_request_id uuid,
  p_recipient_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH request_row AS (
    SELECT left(btrim(r.title), 120) AS title
    FROM public.requests r
    WHERE r.id = p_request_id
  ),
  matched_tags AS (
    SELECT t.name, t.slug
    FROM public.user_notification_tag_interests u
    JOIN public.request_tags rt
      ON rt.request_id = p_request_id
     AND rt.tag_id = u.tag_id
    JOIN public.tags t ON t.id = rt.tag_id AND t.is_active
    WHERE u.user_id = p_recipient_id
  ),
  tag_phrase AS (
    SELECT CASE
      WHEN count(*) = 0 THEN NULL
      WHEN count(*) = 1 THEN lower(min(name)) || ' work'
      ELSE lower(array_to_string(array_agg(name ORDER BY name), ' and '))
    END AS phrase
    FROM matched_tags
  )
  SELECT CASE
    WHEN (SELECT title FROM request_row) IS NOT NULL
         AND char_length((SELECT title FROM request_row)) >= 3 THEN
      format(
        'Someone needs help with %s.',
        quote_literal((SELECT title FROM request_row))
      )
    WHEN (SELECT phrase FROM tag_phrase) IS NOT NULL THEN
      format('Someone needs help with %s.', (SELECT phrase FROM tag_phrase))
    ELSE
      'Someone posted a request that matches your interests.'
  END;
$$;

REVOKE ALL ON FUNCTION public.matching_request_notification_body(uuid, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.matching_request_notification_body(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_tag_interest_subscribers(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_requester_id uuid;
  v_request_title text;
  v_status public.request_status;
  v_payment public.payment_status;
  v_recipient_id uuid;
  v_body text;
  v_notification_title text := 'New request nearby';
  v_metadata jsonb := jsonb_build_object('link', 'respond', 'role', 'helper');
BEGIN
  SELECT r.requester_id, left(btrim(r.title), 120), r.status, r.payment_status
  INTO v_requester_id, v_request_title, v_status, v_payment
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

  IF v_request_title IS NOT NULL AND char_length(v_request_title) >= 3 THEN
    v_notification_title := 'New request';
  END IF;

  FOR v_recipient_id IN
    SELECT DISTINCT u.user_id
    FROM public.user_notification_tag_interests u
    INNER JOIN public.request_tags rt
      ON rt.request_id = p_request_id
     AND rt.tag_id = u.tag_id
    WHERE u.user_id <> v_requester_id
      AND public.request_discoverable_for_user(p_request_id, u.user_id)
  LOOP
    v_body := public.matching_request_notification_body(p_request_id, v_recipient_id);

    PERFORM public.create_notification(
      v_recipient_id,
      'request:' || p_request_id::text || ':tag_interest',
      'matching_request'::public.notification_type,
      v_notification_title,
      v_body,
      format('/respond/%s', p_request_id),
      p_request_id,
      NULL,
      NULL,
      NULL,
      v_requester_id,
      v_metadata,
      true
    );
  END LOOP;
END;
$$;
