-- Tag-interest notify runs inside create_request while auth.uid() is the requester.
-- Subscriber lookup bypasses RLS in a short-lived helper (Supabase postgres is not superuser).

CREATE OR REPLACE FUNCTION public.tag_interest_notification_recipients(
  p_request_id uuid,
  p_requester_id uuid
)
RETURNS SETOF uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  SET LOCAL row_security = off;

  RETURN QUERY
    SELECT DISTINCT u.user_id
    FROM public.user_notification_tag_interests u
    INNER JOIN public.request_tags rt
      ON rt.request_id = p_request_id
     AND rt.tag_id = u.tag_id
    WHERE u.user_id <> p_requester_id
      AND public.request_discoverable_for_user(p_request_id, u.user_id);

  SET LOCAL row_security = on;
END;
$$;

REVOKE ALL ON FUNCTION public.tag_interest_notification_recipients(uuid, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.tag_interest_notification_recipients(uuid, uuid) TO service_role;

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
     OR v_payment NOT IN (
       'not_required'::public.payment_status,
       'locked'::public.payment_status
     ) THEN
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
    SELECT public.tag_interest_notification_recipients(p_request_id, v_requester_id)
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

REVOKE ALL ON FUNCTION public.notify_tag_interest_subscribers(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_tag_interest_subscribers(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.attach_tags_to_request(uuid, uuid[]) FROM anon, authenticated;
GRANT ALL ON FUNCTION public.attach_tags_to_request(uuid, uuid[]) TO service_role;
