-- System lifecycle lines in chat must not surface as new_message push/inbox noise.

CREATE OR REPLACE FUNCTION public.notify_request_message_dispatch(p_message public.request_messages)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_request_id uuid;
  v_recipient_id uuid;
  v_sender_name text;
  v_sender_first text;
  v_body text;
BEGIN
  IF p_message.message_type = 'system'::public.conversation_message_type THEN
    RETURN;
  END IF;

  SELECT c.requester_id, c.selected_user_id, c.request_id
    INTO v_requester_id, v_selected_user_id, v_request_id
  FROM public.request_conversations c
  WHERE c.id = p_message.conversation_id;

  IF v_request_id IS NULL THEN
    RETURN;
  END IF;

  IF p_message.sender_id = v_requester_id THEN
    v_recipient_id := v_selected_user_id;
  ELSIF p_message.sender_id = v_selected_user_id THEN
    v_recipient_id := v_requester_id;
  ELSE
    RETURN;
  END IF;

  IF v_recipient_id IS NULL OR v_recipient_id = p_message.sender_id THEN
    RETURN;
  END IF;

  IF public.recipient_is_viewing_conversation(v_recipient_id, p_message.conversation_id) THEN
    RETURN;
  END IF;

  SELECT p.display_name
    INTO v_sender_name
  FROM public.profiles p
  WHERE p.id = p_message.sender_id;

  v_sender_first := coalesce(public.display_first_name(v_sender_name), 'Someone');
  v_body := public.new_message_notification_body(p_message.id, p_message.body, v_sender_first);

  PERFORM public.create_notification(
    v_recipient_id,
    'request_message:' || p_message.id::text,
    'new_message'::public.notification_type,
    'New message',
    v_body,
    format('/conversation/%s', v_request_id),
    v_request_id,
    NULL,
    NULL,
    NULL,
    p_message.sender_id,
    jsonb_build_object('message_id', p_message.id, 'conversation_id', p_message.conversation_id),
    true
  );
END;
$$;
