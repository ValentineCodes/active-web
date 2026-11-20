-- Pre-handshake chat between project creator and worker (per assignment), wired into conversation RPCs.

CREATE TABLE public.project_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL UNIQUE REFERENCES public.project_assignments (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_conversations_participants_distinct CHECK (creator_id <> worker_id)
);

CREATE INDEX project_conversations_creator_updated_idx
  ON public.project_conversations (creator_id, updated_at DESC);
CREATE INDEX project_conversations_worker_updated_idx
  ON public.project_conversations (worker_id, updated_at DESC);

CREATE TABLE public.project_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.project_conversations (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  message_type public.conversation_message_type NOT NULL DEFAULT 'text'::public.conversation_message_type,
  body text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT project_messages_body_check CHECK (
    char_length(btrim(body)) >= 1 AND char_length(body) <= 2000
  )
);

CREATE INDEX project_messages_conversation_created_idx
  ON public.project_messages (conversation_id, created_at DESC);

ALTER TABLE public.project_conversations OWNER TO postgres;
ALTER TABLE public.project_messages OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.project_conversation_is_accessible(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_conversations c
    WHERE c.id = p_conversation_id
      AND p_user_id IN (c.creator_id, c.worker_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.conversation_project_creator_initiated_chat(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_messages m
    JOIN public.project_conversations c ON c.id = m.conversation_id
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id = c.creator_id
      AND m.message_type <> 'system'::public.conversation_message_type
  );
$$;

CREATE OR REPLACE FUNCTION public.project_conversation_sending_allowed_for_participant(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_assignment_status public.project_assignment_status;
BEGIN
  SELECT a.status
  INTO v_assignment_status
  FROM public.project_conversations c
  JOIN public.project_assignments a ON a.id = c.assignment_id
  WHERE c.id = p_conversation_id
    AND p_user_id IN (c.creator_id, c.worker_id);

  IF v_assignment_status IS NULL THEN
    RETURN false;
  END IF;

  IF v_assignment_status = 'cancelled'::public.project_assignment_status THEN
    RETURN false;
  END IF;

  IF v_assignment_status IN (
    'accepted'::public.project_assignment_status,
    'commenced'::public.project_assignment_status,
    'completed'::public.project_assignment_status
  ) THEN
    RETURN true;
  END IF;

  IF v_assignment_status NOT IN (
    'offered'::public.project_assignment_status,
    'terms_negotiation'::public.project_assignment_status
  ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.project_conversations c
    WHERE c.id = p_conversation_id
      AND (
        p_user_id = c.creator_id
        OR public.conversation_project_creator_initiated_chat(p_conversation_id)
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.open_project_pre_handshake_conversation(p_assignment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_assignment public.project_assignments%rowtype;
  v_conversation_id uuid;
BEGIN
  SELECT * INTO v_assignment
  FROM public.project_assignments a
  WHERE a.id = p_assignment_id
  FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  IF v_assignment.creator_id <> v_user_id THEN
    RAISE EXCEPTION 'only the project creator can start a discussion' USING errcode = '42501';
  END IF;

  IF v_assignment.status NOT IN (
    'offered'::public.project_assignment_status,
    'terms_negotiation'::public.project_assignment_status
  ) THEN
    RAISE EXCEPTION 'this response is no longer available for discussion' USING errcode = '55000';
  END IF;

  INSERT INTO public.project_conversations (
    project_id,
    creator_id,
    worker_id,
    assignment_id
  )
  VALUES (
    v_assignment.project_id,
    v_assignment.creator_id,
    v_assignment.worker_id,
    p_assignment_id
  )
  ON CONFLICT (assignment_id) DO NOTHING
  RETURNING id INTO v_conversation_id;

  IF v_conversation_id IS NULL THEN
    SELECT c.id INTO v_conversation_id
    FROM public.project_conversations c
    WHERE c.assignment_id = p_assignment_id;
  END IF;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation could not be opened' USING errcode = '55000';
  END IF;

  RETURN v_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_project_pre_handshake_conversation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_conversation_is_accessible(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    public.project_conversation_is_accessible(p_conversation_id, p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.request_conversations c
      JOIN public.request_responses rr ON rr.id = c.response_id
        AND rr.request_id = c.request_id
        AND rr.responder_id = c.selected_user_id
      WHERE c.id = p_conversation_id
        AND p_user_id IN (c.requester_id, c.selected_user_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.conversation_sending_allowed_for_participant_request(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.request_conversations c
    JOIN public.requests r ON r.id = c.request_id
    JOIN public.request_responses rr ON rr.id = c.response_id
      AND rr.request_id = c.request_id
      AND rr.responder_id = c.selected_user_id
    WHERE c.id = p_conversation_id
      AND p_user_id IN (c.requester_id, c.selected_user_id)
      AND (
        (
          EXISTS (
            SELECT 1
            FROM public.handshakes h
            WHERE h.request_id = c.request_id
              AND h.selected_user_id = c.selected_user_id
          )
          AND r.selected_user_id = c.selected_user_id
          AND public.request_conversation_messaging_enabled(r.status)
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM public.handshakes h
            WHERE h.request_id = c.request_id
          )
          AND r.status = ANY (
            ARRAY[
              'posted'::public.request_status,
              'searching'::public.request_status,
              'awaiting_review'::public.request_status
            ]
          )
          AND (
            r.status = 'awaiting_review'::public.request_status
            OR r.expires_at > now()
          )
          AND rr.status = 'pending'::public.response_status
          AND (
            p_user_id = c.requester_id
            OR public.conversation_requester_initiated_chat(p_conversation_id)
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.conversation_sending_allowed_for_participant(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    CASE
      WHEN public.project_conversation_is_accessible(p_conversation_id, p_user_id) THEN
        public.project_conversation_sending_allowed_for_participant(p_conversation_id, p_user_id)
      ELSE
        public.conversation_sending_allowed_for_participant_request(p_conversation_id, p_user_id)
    END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_request_conversation_for_viewer(p_lookup_id uuid)
RETURNS TABLE(
  conversation_id uuid,
  request_id uuid,
  requester_id uuid,
  selected_user_id uuid,
  response_id uuid,
  request_status public.request_status,
  messaging_enabled boolean,
  is_pre_handshake boolean,
  request_title text,
  request_description text,
  counterparty_id uuid,
  counterparty_display_name text,
  counterparty_avatar_path text,
  counterparty_identity_verified boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_conversation_id uuid;
  v_counterparty_id uuid;
  v_project_conversation_id uuid;
BEGIN
  IF public.project_conversation_is_accessible(p_lookup_id, v_user_id) THEN
    v_project_conversation_id := p_lookup_id;
  ELSE
    SELECT c.id INTO v_project_conversation_id
    FROM public.project_conversations c
    WHERE c.project_id = p_lookup_id
      AND v_user_id IN (c.creator_id, c.worker_id)
    ORDER BY c.updated_at DESC
    LIMIT 1;
  END IF;

  IF v_project_conversation_id IS NOT NULL THEN
    SELECT
      CASE
        WHEN v_user_id = c.creator_id THEN c.worker_id
        ELSE c.creator_id
      END
    INTO v_counterparty_id
    FROM public.project_conversations c
    WHERE c.id = v_project_conversation_id;

    RETURN QUERY
    SELECT
      c.id,
      c.project_id,
      c.creator_id,
      c.worker_id,
      c.assignment_id,
      'posted'::public.request_status,
      public.project_conversation_sending_allowed_for_participant(c.id, v_user_id),
      a.status IN (
        'offered'::public.project_assignment_status,
        'terms_negotiation'::public.project_assignment_status
      ),
      p.title,
      coalesce(p.description, ''),
      v_counterparty_id,
      prof.display_name,
      prof.avatar_path,
      public.user_marketplace_identity_verified(v_counterparty_id),
      c.created_at,
      c.updated_at
    FROM public.project_conversations c
    JOIN public.project_assignments a ON a.id = c.assignment_id
    JOIN public.projects p ON p.id = c.project_id
    JOIN public.profiles prof ON prof.id = v_counterparty_id
    WHERE c.id = v_project_conversation_id;

    RETURN;
  END IF;

  IF public.request_conversation_is_accessible(p_lookup_id, v_user_id) THEN
    v_conversation_id := p_lookup_id;
  ELSE
    SELECT c.id
      INTO v_conversation_id
    FROM public.request_conversations c
    JOIN public.requests r ON r.id = c.request_id
    JOIN public.handshakes h
      ON h.request_id = c.request_id
     AND h.requester_id = c.requester_id
     AND h.selected_user_id = c.selected_user_id
    WHERE c.request_id = p_lookup_id
      AND v_user_id IN (c.requester_id, c.selected_user_id)
      AND r.selected_user_id = c.selected_user_id;
  END IF;

  IF v_conversation_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    CASE
      WHEN v_user_id = c.requester_id THEN c.selected_user_id
      ELSE c.requester_id
    END
  INTO v_counterparty_id
  FROM public.request_conversations c
  WHERE c.id = v_conversation_id;

  RETURN QUERY
  SELECT
    c.id,
    c.request_id,
    c.requester_id,
    c.selected_user_id,
    c.response_id,
    r.status,
    public.conversation_sending_allowed_for_participant_request(c.id, v_user_id),
    NOT EXISTS (
      SELECT 1
      FROM public.handshakes h
      WHERE h.request_id = c.request_id
    ),
    r.title,
    r.description,
    v_counterparty_id,
    p.display_name,
    p.avatar_path,
    public.user_marketplace_identity_verified(v_counterparty_id),
    c.created_at,
    c.updated_at
  FROM public.request_conversations c
  JOIN public.requests r ON r.id = c.request_id
  JOIN public.profiles p ON p.id = v_counterparty_id
  WHERE c.id = v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_request_messages(
  p_conversation_id uuid,
  p_limit integer DEFAULT 40,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE(
  message_id uuid,
  sender_id uuid,
  message_type public.conversation_message_type,
  body text,
  metadata jsonb,
  attachments jsonb,
  created_at timestamptz,
  read_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_limit integer := greatest(1, least(coalesce(p_limit, 40), 100));
BEGIN
  IF public.project_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    RETURN QUERY
    SELECT
      m.id,
      m.sender_id,
      m.message_type,
      m.body,
      coalesce(m.metadata, '{}'::jsonb),
      '[]'::jsonb,
      m.created_at,
      m.read_at
    FROM public.project_messages m
    WHERE m.conversation_id = p_conversation_id
      AND (p_before IS NULL OR m.created_at < p_before)
    ORDER BY m.created_at DESC
    LIMIT v_limit;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.sender_id,
    m.message_type,
    m.body,
    m.metadata,
    public.request_message_attachments_for_row(m.id),
    m.created_at,
    m.read_at
  FROM public.request_conversations c
  JOIN public.request_messages m ON m.conversation_id = c.id
  WHERE c.id = p_conversation_id
    AND public.request_conversation_is_accessible(c.id, v_user_id)
    AND (p_before IS NULL OR m.created_at < p_before)
  ORDER BY m.created_at DESC
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_request_message(
  p_conversation_id uuid,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_body text := btrim(p_body);
  v_message_id uuid;
BEGIN
  PERFORM public.assert_in_app_profile_photo(v_user_id);

  IF v_body = '' THEN
    RAISE EXCEPTION 'message cannot be empty' USING errcode = '22023';
  END IF;

  IF char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'message is too long' USING errcode = '22023';
  END IF;

  IF NOT public.request_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
  END IF;

  IF NOT public.conversation_sending_allowed(p_conversation_id) THEN
    RAISE EXCEPTION 'this conversation is read-only' USING errcode = '55000';
  END IF;

  IF public.project_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    INSERT INTO public.project_messages (
      conversation_id,
      sender_id,
      message_type,
      body
    )
    VALUES (
      p_conversation_id,
      v_user_id,
      'text'::public.conversation_message_type,
      v_body
    )
    RETURNING id INTO v_message_id;

    UPDATE public.project_conversations
    SET updated_at = now()
    WHERE id = p_conversation_id;

    RETURN v_message_id;
  END IF;

  INSERT INTO public.request_messages (
    conversation_id,
    sender_id,
    message_type,
    body
  )
  VALUES (
    p_conversation_id,
    v_user_id,
    'text'::public.conversation_message_type,
    v_body
  )
  RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$;

ALTER TABLE public.project_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_conversations_select_participant ON public.project_conversations
  FOR SELECT TO authenticated
  USING (auth.uid() IN (creator_id, worker_id));

CREATE POLICY project_messages_select_participant ON public.project_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_conversations c
      WHERE c.id = conversation_id
        AND auth.uid() IN (c.creator_id, c.worker_id)
    )
  );

GRANT SELECT ON TABLE public.project_conversations TO authenticated;
GRANT SELECT ON TABLE public.project_messages TO authenticated;
GRANT ALL ON TABLE public.project_conversations TO service_role;
GRANT ALL ON TABLE public.project_messages TO service_role;