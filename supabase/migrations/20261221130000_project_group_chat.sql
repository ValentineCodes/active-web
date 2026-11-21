-- Shared project group chat (one conversation per project) with server-managed membership.
-- Pre-handshake project_conversations (per assignment) remain private 1:1 threads.

CREATE TYPE public.project_group_member_role AS ENUM (
  'creator',
  'contributor',
  'worker'
);

CREATE TABLE public.project_group_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.project_group_conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.project_group_conversations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role public.project_group_member_role NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX project_group_members_user_idx
  ON public.project_group_conversation_members (user_id, joined_at DESC);

CREATE TABLE public.project_group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.project_group_conversations (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  message_type public.conversation_message_type NOT NULL DEFAULT 'text'::public.conversation_message_type,
  body text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT project_group_messages_body_check CHECK (
    char_length(body) <= 2000
  )
);

CREATE INDEX project_group_messages_conversation_created_idx
  ON public.project_group_messages (conversation_id, created_at DESC);

CREATE TABLE public.project_group_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.project_group_messages (id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES public.project_group_conversations (id) ON DELETE RESTRICT,
  sender_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  file_name text,
  mime_type text NOT NULL,
  file_size bigint,
  attachment_type public.conversation_attachment_type NOT NULL,
  uploaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_group_message_attachments_file_size_check CHECK (
    file_size IS NULL OR file_size >= 0
  )
);

CREATE INDEX project_group_message_attachments_message_idx
  ON public.project_group_message_attachments (message_id);

CREATE INDEX project_group_message_attachments_conversation_idx
  ON public.project_group_message_attachments (conversation_id, created_at DESC);

ALTER TABLE public.project_group_conversations OWNER TO postgres;
ALTER TABLE public.project_group_conversation_members OWNER TO postgres;
ALTER TABLE public.project_group_messages OWNER TO postgres;
ALTER TABLE public.project_group_message_attachments OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.ensure_project_group_conversation(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_conversation_id uuid;
BEGIN
  INSERT INTO public.project_group_conversations (project_id)
  VALUES (p_project_id)
  ON CONFLICT (project_id) DO NOTHING;

  SELECT id INTO v_conversation_id
  FROM public.project_group_conversations
  WHERE project_id = p_project_id;

  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_project_group_conversation_member(
  p_project_id uuid,
  p_user_id uuid,
  p_role public.project_group_member_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_conversation_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  v_conversation_id := public.ensure_project_group_conversation(p_project_id);

  INSERT INTO public.project_group_conversation_members (
    conversation_id,
    user_id,
    role
  )
  VALUES (v_conversation_id, p_user_id, p_role)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_group_conversation_is_accessible(
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
    FROM public.project_group_conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.project_group_conversation_for_project(
  p_project_id uuid,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT c.id
  FROM public.project_group_conversations c
  JOIN public.project_group_conversation_members m ON m.conversation_id = c.id
  WHERE c.project_id = p_project_id
    AND m.user_id = p_user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.project_group_unread_count(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT count(*)::integer
  FROM public.project_group_messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_id <> p_user_id
    AND m.read_at IS NULL
    AND public.project_group_conversation_is_accessible(p_conversation_id, p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.project_group_message_attachments_for_row(p_message_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'storage_path', a.storage_path,
        'file_name', a.file_name,
        'mime_type', a.mime_type,
        'file_size', a.file_size,
        'attachment_type', a.attachment_type,
        'created_at', coalesce(a.uploaded_at, a.created_at)
      )
      ORDER BY a.created_at, a.id
    ),
    '[]'::jsonb
  )
  FROM public.project_group_message_attachments a
  WHERE a.message_id = p_message_id
    AND a.uploaded_at IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.project_group_messages_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_project_id uuid;
  v_project_title text;
  v_recipient record;
  v_sender_name text;
  v_sender_first text;
  v_body text;
BEGIN
  SELECT c.project_id, p.title
  INTO v_project_id, v_project_title
  FROM public.project_group_conversations c
  JOIN public.projects p ON p.id = c.project_id
  WHERE c.id = NEW.conversation_id;

  IF v_project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT prof.display_name INTO v_sender_name
  FROM public.profiles prof
  WHERE prof.id = NEW.sender_id;

  v_sender_first := coalesce(public.display_first_name(v_sender_name), 'Someone');
  v_body := left(btrim(NEW.body), 200);

  FOR v_recipient IN
    SELECT m.user_id
    FROM public.project_group_conversation_members m
    WHERE m.conversation_id = NEW.conversation_id
      AND m.user_id <> NEW.sender_id
  LOOP
    IF public.recipient_is_viewing_conversation(v_recipient.user_id, NEW.conversation_id) THEN
      CONTINUE;
    END IF;

    PERFORM public.create_notification(
      v_recipient.user_id,
      'project_group:' || NEW.conversation_id::text || ':msg:' || NEW.id::text,
      'new_message'::public.notification_type,
      v_project_title,
      format('%s: %s', v_sender_first, coalesce(nullif(v_body, ''), 'Sent an attachment')),
      format('/messages/%s?returnTo=/project/%s', NEW.conversation_id, v_project_id),
      NULL,
      NULL,
      NULL,
      NULL,
      NEW.sender_id,
      jsonb_build_object('project_id', v_project_id, 'conversation_id', NEW.conversation_id),
      true
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER project_group_messages_notify
  AFTER INSERT ON public.project_group_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.project_group_messages_notify();

CREATE OR REPLACE FUNCTION public.trg_project_created_group_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.add_project_group_conversation_member(
    NEW.id,
    NEW.creator_id,
    'creator'::public.project_group_member_role
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_created_group_chat
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_project_created_group_chat();

CREATE OR REPLACE FUNCTION public.trg_project_contribution_group_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.add_project_group_conversation_member(
    NEW.project_id,
    NEW.contributor_id,
    'contributor'::public.project_group_member_role
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER project_contributions_group_member
  AFTER INSERT ON public.project_contributions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_project_contribution_group_member();

CREATE OR REPLACE FUNCTION public.trg_project_assignment_accepted_group_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status = 'accepted'::public.project_assignment_status
     AND (OLD.status IS DISTINCT FROM 'accepted'::public.project_assignment_status) THEN
    PERFORM public.add_project_group_conversation_member(
      NEW.project_id,
      NEW.worker_id,
      'worker'::public.project_group_member_role
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER project_assignments_accepted_group_member
  AFTER UPDATE OF status ON public.project_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_project_assignment_accepted_group_member();

-- Backfill conversations and membership for existing projects.
INSERT INTO public.project_group_conversations (project_id)
SELECT p.id FROM public.projects p
ON CONFLICT (project_id) DO NOTHING;

INSERT INTO public.project_group_conversation_members (conversation_id, user_id, role)
SELECT c.id, p.creator_id, 'creator'::public.project_group_member_role
FROM public.projects p
JOIN public.project_group_conversations c ON c.project_id = p.id
ON CONFLICT DO NOTHING;

INSERT INTO public.project_group_conversation_members (conversation_id, user_id, role)
SELECT c.id, pc.contributor_id, 'contributor'::public.project_group_member_role
FROM public.project_contributions pc
JOIN public.project_group_conversations c ON c.project_id = pc.project_id
ON CONFLICT DO NOTHING;

INSERT INTO public.project_group_conversation_members (conversation_id, user_id, role)
SELECT c.id, a.worker_id, 'worker'::public.project_group_member_role
FROM public.project_assignments a
JOIN public.project_group_conversations c ON c.project_id = a.project_id
WHERE a.status IN (
  'accepted'::public.project_assignment_status,
  'commenced'::public.project_assignment_status,
  'completed'::public.project_assignment_status
)
ON CONFLICT DO NOTHING;

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
    public.project_group_conversation_is_accessible(p_conversation_id, p_user_id)
    OR public.project_conversation_is_accessible(p_conversation_id, p_user_id)
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
      WHEN public.project_group_conversation_is_accessible(p_conversation_id, p_user_id) THEN
        true
      WHEN public.project_conversation_is_accessible(p_conversation_id, p_user_id) THEN
        public.project_conversation_sending_allowed_for_participant(p_conversation_id, p_user_id)
      ELSE
        public.conversation_sending_allowed_for_participant_request(p_conversation_id, p_user_id)
    END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.project_group_messages;

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
  v_group_conversation_id uuid;
BEGIN
  IF public.project_group_conversation_is_accessible(p_lookup_id, v_user_id) THEN
    v_group_conversation_id := p_lookup_id;
  ELSE
    v_group_conversation_id := public.project_group_conversation_for_project(p_lookup_id, v_user_id);
  END IF;

  IF v_group_conversation_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      gc.id,
      gc.project_id,
      p.creator_id,
      p.creator_id,
      NULL::uuid,
      'posted'::public.request_status,
      true,
      false,
      p.title,
      coalesce(p.description, ''),
      p.creator_id,
      'Project team'::text,
      NULL::text,
      false,
      gc.created_at,
      gc.updated_at
    FROM public.project_group_conversations gc
    JOIN public.projects p ON p.id = gc.project_id
    WHERE gc.id = v_group_conversation_id;

    RETURN;
  END IF;

  IF public.project_conversation_is_accessible(p_lookup_id, v_user_id) THEN
    SELECT
      CASE
        WHEN v_user_id = c.creator_id THEN c.worker_id
        ELSE c.creator_id
      END
    INTO v_counterparty_id
    FROM public.project_conversations c
    WHERE c.id = p_lookup_id;

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
    WHERE c.id = p_lookup_id;

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
  IF public.project_group_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    RETURN QUERY
    SELECT
      m.id,
      m.sender_id,
      m.message_type,
      m.body,
      coalesce(m.metadata, '{}'::jsonb),
      public.project_group_message_attachments_for_row(m.id),
      m.created_at,
      m.read_at
    FROM public.project_group_messages m
    WHERE m.conversation_id = p_conversation_id
      AND (p_before IS NULL OR m.created_at < p_before)
    ORDER BY m.created_at DESC
    LIMIT v_limit;
    RETURN;
  END IF;

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

  IF public.project_group_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    INSERT INTO public.project_group_messages (
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

    UPDATE public.project_group_conversations
    SET updated_at = now()
    WHERE id = p_conversation_id;

    RETURN v_message_id;
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

CREATE OR REPLACE FUNCTION public.get_request_message_for_viewer(p_message_id uuid)
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
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.project_group_messages m
    WHERE m.id = p_message_id
      AND public.project_group_conversation_is_accessible(m.conversation_id, v_user_id)
  ) THEN
    RETURN QUERY
    SELECT
      m.id,
      m.sender_id,
      m.message_type,
      m.body,
      coalesce(m.metadata, '{}'::jsonb),
      public.project_group_message_attachments_for_row(m.id),
      m.created_at,
      m.read_at
    FROM public.project_group_messages m
    WHERE m.id = p_message_id;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_messages m
    WHERE m.id = p_message_id
      AND public.project_conversation_is_accessible(m.conversation_id, v_user_id)
  ) THEN
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
    WHERE m.id = p_message_id;
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
  FROM public.request_messages m
  JOIN public.request_conversations c ON c.id = m.conversation_id
  WHERE m.id = p_message_id
    AND public.request_conversation_is_accessible(c.id, v_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_request_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  IF NOT public.request_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
  END IF;

  IF public.project_group_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    UPDATE public.project_group_messages m
    SET read_at = coalesce(m.read_at, now())
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id <> v_user_id
      AND m.read_at IS NULL;

    UPDATE public.notification_inbox ni
    SET read_at = now()
    WHERE ni.user_id = v_user_id
      AND ni.type = 'new_message'::public.notification_type
      AND ni.read_at IS NULL
      AND coalesce(ni.metadata ->> 'conversation_id', '') = p_conversation_id::text;

    RETURN;
  END IF;

  IF public.project_conversation_is_accessible(p_conversation_id, v_user_id) THEN
    UPDATE public.project_messages m
    SET read_at = coalesce(m.read_at, now())
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id <> v_user_id
      AND m.read_at IS NULL;
    RETURN;
  END IF;

  UPDATE public.request_messages m
  SET read_at = coalesce(m.read_at, now())
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_id <> v_user_id
    AND m.read_at IS NULL;

  UPDATE public.notification_inbox ni
  SET read_at = now()
  WHERE ni.user_id = v_user_id
      AND ni.type = 'new_message'::public.notification_type
      AND ni.read_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.request_conversations c
        WHERE c.id = p_conversation_id
          AND c.request_id = ni.request_id
      );
END;
$$;

DROP FUNCTION IF EXISTS public.get_project(uuid);

CREATE OR REPLACE FUNCTION public.get_project(p_project_id uuid)
RETURNS TABLE(
  project_id uuid,
  creator_id uuid,
  creator_display_name text,
  creator_avatar_path text,
  creator_bio text,
  creator_rating_average numeric,
  creator_rating_count integer,
  creator_completion_percent integer,
  creator_identity_verified boolean,
  title text,
  description text,
  attachment_path text,
  project_visibility public.project_visibility,
  funding_visibility public.project_funding_visibility,
  budget_total_kobo bigint,
  min_funding_target_kobo bigint,
  min_contribution_kobo bigint,
  funding_deadline_at timestamptz,
  funding_timezone text,
  funding_opened_at timestamptz,
  status public.project_status,
  funding_status public.project_funding_status,
  min_target_reached_at timestamptz,
  fully_funded_at timestamptz,
  funding_unsuccessful_at timestamptz,
  contributed_total_kobo bigint,
  reserved_total_kobo bigint,
  committed_compensation_kobo bigint,
  viewer_is_creator boolean,
  viewer_is_contributor boolean,
  viewer_may_view_assignments boolean,
  viewer_may_contribute boolean,
  tag_slugs text[],
  location_label text,
  group_chat_conversation_id uuid,
  group_chat_unread_count integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_group_id uuid;
BEGIN
  PERFORM public.assert_may_view_project(p_project_id, v_user_id);
  PERFORM public.evaluate_project_funding_status(p_project_id);

  v_group_id := public.project_group_conversation_for_project(p_project_id, v_user_id);

  RETURN QUERY
  SELECT
    p.id,
    p.creator_id,
    prof.display_name,
    prof.avatar_path,
    prof.bio,
    prof.rating_average,
    prof.rating_count,
    public.requester_completion_percent(p.creator_id),
    public.user_marketplace_identity_verified(prof.id),
    p.title,
    p.description,
    p.attachment_path,
    p.project_visibility,
    p.funding_visibility,
    p.budget_total_kobo,
    p.min_funding_target_kobo,
    p.min_contribution_kobo,
    p.funding_deadline_at,
    p.funding_timezone,
    p.funding_opened_at,
    p.status,
    p.funding_status,
    p.min_target_reached_at,
    p.fully_funded_at,
    p.funding_unsuccessful_at,
    pool.contributed_total_kobo,
    pool.reserved_total_kobo,
    pool.committed_compensation_kobo,
    p.creator_id = v_user_id,
    EXISTS (
      SELECT 1
      FROM public.project_contributions pc
      WHERE pc.project_id = p.id
        AND pc.contributor_id = v_user_id
    ),
    (
      p.creator_id = v_user_id
      OR EXISTS (
        SELECT 1
        FROM public.project_contributions pc
        WHERE pc.project_id = p.id
          AND pc.contributor_id = v_user_id
      )
    ),
    (
      p.funding_status IN (
        'open'::public.project_funding_status,
        'target_met'::public.project_funding_status
      )
      AND (
        p.funding_visibility = 'public'::public.project_funding_visibility
        OR p.creator_id = v_user_id
        OR EXISTS (
          SELECT 1
          FROM public.project_contributor_invitations inv
          WHERE inv.project_id = p.id AND inv.invitee_id = v_user_id
        )
      )
    ),
    coalesce(
      (
        SELECT array_agg(t.slug ORDER BY t.slug)
        FROM public.project_tags pt
        JOIN public.tags t ON t.id = pt.tag_id
        WHERE pt.project_id = p.id
      ),
      '{}'::text[]
    ),
    p.location_label,
    v_group_id,
    CASE
      WHEN v_group_id IS NULL THEN 0
      ELSE public.project_group_unread_count(v_group_id, v_user_id)
    END
  FROM public.projects p
  JOIN public.project_funding_pools pool ON pool.project_id = p.id
  JOIN public.profiles prof ON prof.id = p.creator_id
  WHERE p.id = p_project_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_group_conversation_for_project(uuid, uuid) TO authenticated;

ALTER TABLE public.project_group_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_group_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_group_message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_group_members_select_self ON public.project_group_conversation_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY project_group_messages_select_member ON public.project_group_messages
  FOR SELECT TO authenticated
  USING (
    public.project_group_conversation_is_accessible(conversation_id, auth.uid())
  );

GRANT SELECT ON public.project_group_conversations TO authenticated;
GRANT SELECT ON public.project_group_conversation_members TO authenticated;
GRANT SELECT ON public.project_group_messages TO authenticated;
GRANT SELECT ON public.project_group_message_attachments TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_conversation_media(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT exists (
    SELECT 1
    FROM public.request_message_attachments a
    WHERE a.storage_path = p_name
      AND a.uploaded_at IS NOT NULL
      AND public.request_conversation_is_accessible(a.conversation_id, (SELECT auth.uid()))
  )
  OR exists (
    SELECT 1
    FROM public.project_group_message_attachments a
    WHERE a.storage_path = p_name
      AND a.uploaded_at IS NOT NULL
      AND public.project_group_conversation_is_accessible(a.conversation_id, (SELECT auth.uid()))
  )
  OR (
    (storage.foldername(p_name))[2] = 'conversations'
    AND public.request_conversation_is_accessible(
      ((storage.foldername(p_name))[3])::uuid,
      (SELECT auth.uid())
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_conversation_media(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT exists (
    SELECT 1
    FROM public.request_message_attachments a
    WHERE a.storage_path = p_name
      AND a.sender_id = (SELECT auth.uid())
      AND a.uploaded_at IS NULL
      AND public.request_conversation_is_accessible(a.conversation_id, (SELECT auth.uid()))
      AND split_part(p_name, '/', 1) = a.sender_id::text
      AND split_part(p_name, '/', 2) = 'chat'
      AND split_part(p_name, '/', 3) = a.conversation_id::text
      AND split_part(p_name, '/', 4) = a.message_id::text
      AND split_part(p_name, '/', 5) LIKE a.id::text || '-%'
  )
  OR exists (
    SELECT 1
    FROM public.project_group_message_attachments a
    WHERE a.storage_path = p_name
      AND a.sender_id = (SELECT auth.uid())
      AND a.uploaded_at IS NULL
      AND public.project_group_conversation_is_accessible(a.conversation_id, (SELECT auth.uid()))
      AND split_part(p_name, '/', 1) = a.sender_id::text
      AND split_part(p_name, '/', 2) = 'chat'
      AND split_part(p_name, '/', 3) = a.conversation_id::text
      AND split_part(p_name, '/', 4) = a.message_id::text
      AND split_part(p_name, '/', 5) LIKE a.id::text || '-%'
  );
$$;

CREATE OR REPLACE FUNCTION public.complete_request_message_with_attachments(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_conversation_id uuid;
  v_attachment record;
  v_storage_mime text;
  v_storage_size bigint;
  v_kind public.conversation_attachment_type;
BEGIN
  SELECT m.conversation_id
  INTO v_conversation_id
  FROM public.project_group_messages m
  WHERE m.id = p_message_id
    AND m.sender_id = v_user_id;

  IF v_conversation_id IS NOT NULL THEN
    IF NOT public.request_conversation_is_accessible(v_conversation_id, v_user_id) THEN
      RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
    END IF;

    FOR v_attachment IN
      SELECT a.id, a.storage_path, a.mime_type, a.attachment_type, a.file_size
      FROM public.project_group_message_attachments a
      WHERE a.message_id = p_message_id
        AND a.sender_id = v_user_id
        AND a.uploaded_at IS NULL
    LOOP
      SELECT
        coalesce(
          nullif(btrim(o.metadata ->> 'mimetype'), ''),
          nullif(btrim(o.metadata ->> 'contentType'), '')
        ),
        coalesce(
          nullif(btrim(o.metadata ->> 'size'), '')::bigint,
          nullif(btrim(o.metadata ->> 'contentLength'), '')::bigint
        )
      INTO v_storage_mime, v_storage_size
      FROM storage.objects o
      WHERE o.bucket_id = 'conversation-media'
        AND o.name = v_attachment.storage_path;

      IF v_storage_mime IS NULL THEN
        RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
      END IF;

      v_storage_size := coalesce(v_storage_size, v_attachment.file_size);
      v_kind := public.conversation_attachment_validate_stored(
        v_storage_mime,
        v_storage_size,
        v_attachment.attachment_type
      );

      UPDATE public.project_group_message_attachments a
      SET
        uploaded_at = now(),
        mime_type = public.conversation_attachment_normalize_mime(v_storage_mime),
        attachment_type = v_kind,
        file_size = v_storage_size
      WHERE a.id = v_attachment.id;
    END LOOP;

    UPDATE public.project_group_conversations SET updated_at = now() WHERE id = v_conversation_id;
    RETURN;
  END IF;

  SELECT m.conversation_id
  INTO v_conversation_id
  FROM public.request_messages m
  WHERE m.id = p_message_id
    AND m.sender_id = v_user_id
    AND m.message_type = 'text'::public.conversation_message_type;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '42501';
  END IF;

  IF NOT public.request_conversation_is_accessible(v_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.request_message_attachments a
    WHERE a.message_id = p_message_id
      AND a.uploaded_at IS NULL
  ) THEN
    RETURN;
  END IF;

  FOR v_attachment IN
    SELECT a.id, a.storage_path, a.mime_type, a.attachment_type, a.file_size
    FROM public.request_message_attachments a
    WHERE a.message_id = p_message_id
      AND a.sender_id = v_user_id
      AND a.uploaded_at IS NULL
  LOOP
    SELECT
      coalesce(
        nullif(btrim(o.metadata ->> 'mimetype'), ''),
        nullif(btrim(o.metadata ->> 'contentType'), '')
      ),
      coalesce(
        nullif(btrim(o.metadata ->> 'size'), '')::bigint,
        nullif(btrim(o.metadata ->> 'contentLength'), '')::bigint
      )
    INTO v_storage_mime, v_storage_size
    FROM storage.objects o
    WHERE o.bucket_id = 'conversation-media'
      AND o.name = v_attachment.storage_path;

    IF v_storage_mime IS NULL THEN
      RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
    END IF;

    v_storage_size := coalesce(v_storage_size, v_attachment.file_size);

    v_kind := public.conversation_attachment_validate_stored(
      v_storage_mime,
      v_storage_size,
      v_attachment.attachment_type
    );

    UPDATE public.request_message_attachments a
    SET
      uploaded_at = now(),
      mime_type = public.conversation_attachment_normalize_mime(v_storage_mime),
      attachment_type = v_kind,
      file_size = v_storage_size
    WHERE a.id = v_attachment.id;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM public.request_message_attachments a
    WHERE a.message_id = p_message_id
      AND a.uploaded_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
  END IF;

  PERFORM public.notify_request_message_manual(p_message_id);
END;
$$;