-- Formal assignment submissions: audit record + shared project group chat message.

ALTER TABLE public.project_assignment_submissions
  ADD COLUMN IF NOT EXISTS group_message_id uuid REFERENCES public.project_group_messages (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS project_assignment_submissions_group_message_idx
  ON public.project_assignment_submissions (group_message_id)
  WHERE group_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.project_assignment_submission_metadata(
  p_submission_id uuid,
  p_review_state text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'kind', 'project_assignment_submission',
    'submission_id', p_submission_id::text,
    'assignment_id', a.id::text,
    'project_id', a.project_id::text,
    'milestone_id', s.milestone_id::text,
    'assignment_title', t.title,
    'milestone_title', m.title,
    'milestone_position', m.position,
    'review_state', p_review_state
  )
  FROM public.project_assignment_submissions s
  JOIN public.project_assignments a ON a.id = s.assignment_id
  JOIN public.project_assignment_terms t ON t.id = a.active_terms_id
  LEFT JOIN public.project_assignment_milestones m ON m.id = s.milestone_id
  WHERE s.id = p_submission_id;
$$;

CREATE OR REPLACE FUNCTION public.project_assignment_submission_assert_may_submit(
  p_assignment_id uuid,
  p_user_id uuid,
  p_milestone_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_assignment public.project_assignments%rowtype;
  v_milestone public.project_assignment_milestones%rowtype;
  v_prior_unpaid integer;
BEGIN
  SELECT * INTO v_assignment
  FROM public.project_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF v_assignment.id IS NULL OR v_assignment.worker_id <> p_user_id THEN
    RAISE EXCEPTION 'assignment not found' USING errcode = 'P0002';
  END IF;

  IF v_assignment.status <> 'commenced'::public.project_assignment_status THEN
    RAISE EXCEPTION 'assignment is not in progress' USING errcode = '55000';
  END IF;

  IF public.project_assignment_has_open_dispute(p_assignment_id) THEN
    RAISE EXCEPTION 'assignment has an open dispute' USING errcode = '55000';
  END IF;

  IF p_milestone_id IS NOT NULL THEN
    SELECT * INTO v_milestone
    FROM public.project_assignment_milestones m
    WHERE m.id = p_milestone_id AND m.assignment_id = p_assignment_id
    FOR UPDATE;

    IF v_milestone.id IS NULL THEN
      RAISE EXCEPTION 'milestone not found' USING errcode = 'P0002';
    END IF;

    IF v_milestone.position > 1 THEN
      SELECT count(*)::int INTO v_prior_unpaid
      FROM public.project_assignment_milestones m
      WHERE m.assignment_id = p_assignment_id
        AND m.position < v_milestone.position
        AND m.status <> 'approved_paid'::public.milestone_status;

      IF v_prior_unpaid > 0 THEN
        RAISE EXCEPTION 'earlier milestones must be approved before submitting this one' USING errcode = '55000';
      END IF;
    END IF;

    IF v_milestone.status NOT IN (
      'in_progress'::public.milestone_status,
      'revision_requested'::public.milestone_status
    ) THEN
      RAISE EXCEPTION 'milestone cannot be submitted in its current state' USING errcode = '55000';
    END IF;
  ELSIF v_assignment.payment_structure = 'milestone'::public.payment_structure THEN
    RAISE EXCEPTION 'milestone id is required for milestone assignments' USING errcode = '22023';
  END IF;

END;
$$;

CREATE OR REPLACE FUNCTION public.begin_project_assignment_submission(
  p_assignment_id uuid,
  p_milestone_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_planned_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(
  message_id uuid,
  conversation_id uuid,
  attachment_id uuid,
  storage_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_assignment public.project_assignments%rowtype;
  v_conversation_id uuid;
  v_message_id uuid;
  v_body text := left(btrim(coalesce(p_note, '')), 2000);
  v_item jsonb;
  v_attachment_id uuid;
  v_file_name text;
  v_mime_type text;
  v_file_size bigint;
  v_attachment_type public.conversation_attachment_type;
  v_storage_path text;
  v_count integer := 0;
  v_terms_title text;
  v_milestone_title text;
BEGIN
  IF jsonb_typeof(p_planned_attachments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
  END IF;

  IF jsonb_array_length(p_planned_attachments) < 1 THEN
    RAISE EXCEPTION 'At least one file is required for a formal submission' USING errcode = '22023';
  END IF;

  IF jsonb_array_length(p_planned_attachments) > 10 THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
  END IF;

  PERFORM public.project_assignment_submission_assert_may_submit(
    p_assignment_id,
    v_user_id,
    p_milestone_id
  );

  SELECT * INTO v_assignment
  FROM public.project_assignments
  WHERE id = p_assignment_id;

  v_conversation_id := public.ensure_project_group_conversation(v_assignment.project_id);
  PERFORM public.add_project_group_conversation_member(
    v_assignment.project_id,
    v_user_id,
    'worker'::public.project_group_member_role
  );

  IF NOT public.project_group_conversation_is_accessible(v_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
  END IF;

  PERFORM public.assert_in_app_profile_photo(v_user_id);

  SELECT t.title INTO v_terms_title
  FROM public.project_assignment_terms t
  WHERE t.id = v_assignment.active_terms_id;

  IF p_milestone_id IS NOT NULL THEN
    SELECT m.title INTO v_milestone_title
    FROM public.project_assignment_milestones m
    WHERE m.id = p_milestone_id;
  END IF;

  IF v_body = '' THEN
    v_body := format(
      'Submitted work for %s%s',
      coalesce(v_terms_title, 'assignment'),
      CASE WHEN v_milestone_title IS NOT NULL THEN format(' — %s', v_milestone_title) ELSE '' END
    );
  END IF;

  INSERT INTO public.project_group_messages (
    conversation_id,
    sender_id,
    message_type,
    body,
    metadata
  )
  VALUES (
    v_conversation_id,
    v_user_id,
    'text'::public.conversation_message_type,
    v_body,
    jsonb_build_object(
      'draft_submission', true,
      'assignment_id', p_assignment_id::text,
      'milestone_id', p_milestone_id::text,
      'assignment_title', coalesce(v_terms_title, ''),
      'milestone_title', v_milestone_title
    )
  )
  RETURNING id INTO v_message_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_planned_attachments)
  LOOP
    v_file_name := nullif(btrim(v_item ->> 'file_name'), '');
    v_mime_type := nullif(btrim(v_item ->> 'mime_type'), '');
    v_attachment_type := (v_item ->> 'attachment_type')::public.conversation_attachment_type;

    IF v_mime_type IS NULL OR v_attachment_type IS NULL THEN
      RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
    END IF;

    IF v_item ? 'file_size' AND v_item ->> 'file_size' IS NOT NULL THEN
      v_file_size := (v_item ->> 'file_size')::bigint;
    ELSE
      v_file_size := NULL;
    END IF;

    PERFORM public.conversation_attachment_validate_planned(
      v_file_name,
      v_mime_type,
      v_file_size,
      v_attachment_type
    );

    v_attachment_id := gen_random_uuid();
    v_storage_path := public.conversation_chat_storage_path(
      v_user_id,
      v_conversation_id,
      v_message_id,
      v_attachment_id,
      coalesce(v_file_name, 'attachment')
    );

    INSERT INTO public.project_group_message_attachments (
      id,
      message_id,
      conversation_id,
      sender_id,
      storage_path,
      file_name,
      mime_type,
      file_size,
      attachment_type,
      uploaded_at
    )
    VALUES (
      v_attachment_id,
      v_message_id,
      v_conversation_id,
      v_user_id,
      v_storage_path,
      v_file_name,
      public.conversation_attachment_normalize_mime(v_mime_type),
      v_file_size,
      v_attachment_type,
      NULL
    );

    message_id := v_message_id;
    conversation_id := v_conversation_id;
    attachment_id := v_attachment_id;
    storage_path := v_storage_path;
    RETURN NEXT;
    v_count := v_count + 1;
  END LOOP;

  IF v_count < 1 THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_project_assignment_submission(p_message_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_conversation_id uuid;
  v_metadata jsonb;
  v_assignment_id uuid;
  v_milestone_id uuid;
  v_submission_id uuid;
  v_paths text[];
  v_note text;
BEGIN
  SELECT m.conversation_id, m.metadata, m.body
  INTO v_conversation_id, v_metadata, v_note
  FROM public.project_group_messages m
  WHERE m.id = p_message_id
    AND m.sender_id = v_user_id
  FOR UPDATE;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '42501';
  END IF;

  IF coalesce(v_metadata->>'draft_submission', '') <> 'true' THEN
    RAISE EXCEPTION 'not a pending assignment submission' USING errcode = '55000';
  END IF;

  IF v_metadata ? 'submission_id' THEN
    RETURN (v_metadata->>'submission_id')::uuid;
  END IF;

  v_assignment_id := (v_metadata->>'assignment_id')::uuid;
  v_milestone_id := nullif(v_metadata->>'milestone_id', '')::uuid;

  PERFORM public.project_assignment_submission_assert_may_submit(
    v_assignment_id,
    v_user_id,
    v_milestone_id
  );

  PERFORM public.complete_request_message_with_attachments(p_message_id);

  SELECT coalesce(array_agg(a.storage_path ORDER BY a.created_at), '{}'::text[])
  INTO v_paths
  FROM public.project_group_message_attachments a
  WHERE a.message_id = p_message_id
    AND a.sender_id = v_user_id
    AND a.uploaded_at IS NOT NULL;

  IF cardinality(v_paths) < 1 THEN
    RAISE EXCEPTION 'At least one file is required for a formal submission' USING errcode = '22023';
  END IF;

  INSERT INTO public.project_assignment_submissions (
    assignment_id,
    milestone_id,
    submitted_by,
    note,
    evidence_paths,
    group_message_id
  )
  VALUES (
    v_assignment_id,
    v_milestone_id,
    v_user_id,
    nullif(btrim(v_note), ''),
    v_paths,
    p_message_id
  )
  RETURNING id INTO v_submission_id;

  IF v_milestone_id IS NOT NULL THEN
    UPDATE public.project_assignment_milestones
    SET status = 'submitted'::public.milestone_status,
        submitted_at = now(),
        submitted_by = v_user_id
    WHERE id = v_milestone_id;
  END IF;

  v_metadata := public.project_assignment_submission_metadata(v_submission_id, 'awaiting_review');

  UPDATE public.project_group_messages
  SET
    metadata = v_metadata,
    updated_at = now()
  WHERE id = p_message_id;

  UPDATE public.project_group_conversations SET updated_at = now() WHERE id = v_conversation_id;

  RETURN v_submission_id;
END;
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
  v_is_submission boolean;
  v_link text;
  v_title text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.metadata->>'draft_submission', '') = 'true'
      AND NOT (NEW.metadata ? 'submission_id') THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT (
      coalesce(NEW.metadata->>'kind', '') = 'project_assignment_submission'
      AND coalesce(OLD.metadata->>'kind', '') <> 'project_assignment_submission'
    ) THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

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
  v_is_submission := coalesce(NEW.metadata->>'kind', '') = 'project_assignment_submission';
  v_body := left(btrim(NEW.body), 200);

  IF v_is_submission THEN
    v_title := 'Work submitted';
    v_link := format(
      '/messages/%s?returnTo=/project/%s/assignment/%s',
      NEW.conversation_id,
      coalesce(NEW.metadata->>'project_id', v_project_id::text),
      coalesce(NEW.metadata->>'assignment_id', '')
    );
    v_body := format(
      '%s submitted deliverables for %s',
      v_sender_first,
      coalesce(nullif(NEW.metadata->>'assignment_title', ''), 'an assignment')
    );
  ELSE
    v_title := v_project_title;
    v_link := format('/messages/%s?returnTo=/project/%s', NEW.conversation_id, v_project_id);
  END IF;

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
      CASE
        WHEN v_is_submission THEN
          'project_submission:' || coalesce(NEW.metadata->>'submission_id', NEW.id::text)
        ELSE
          'project_group:' || NEW.conversation_id::text || ':msg:' || NEW.id::text
      END,
      'new_message'::public.notification_type,
      v_title,
      coalesce(nullif(v_body, ''), 'Sent an attachment'),
      v_link,
      NULL,
      NULL,
      NULL,
      NULL,
      NEW.sender_id,
      jsonb_build_object(
        'project_id', v_project_id,
        'conversation_id', NEW.conversation_id,
        'submission_id', NEW.metadata->>'submission_id',
        'assignment_id', NEW.metadata->>'assignment_id'
      ),
      true
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_group_messages_notify ON public.project_group_messages;

CREATE TRIGGER project_group_messages_notify_insert
  AFTER INSERT ON public.project_group_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.project_group_messages_notify();

CREATE TRIGGER project_group_messages_notify_update
  AFTER UPDATE OF metadata ON public.project_group_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.project_group_messages_notify();

CREATE OR REPLACE FUNCTION public.project_assignment_sync_submission_message_review(
  p_submission_id uuid,
  p_review_state text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_message_id uuid;
BEGIN
  SELECT s.group_message_id INTO v_message_id
  FROM public.project_assignment_submissions s
  WHERE s.id = p_submission_id;

  IF v_message_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.project_group_messages m
  SET metadata = m.metadata || jsonb_build_object('review_state', p_review_state),
      updated_at = now()
  WHERE m.id = v_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_assignment_release_payment(
  p_assignment_id uuid,
  p_milestone_id uuid,
  p_idempotency_key text,
  p_provider_kobo bigint,
  p_fee_kobo bigint,
  p_total_kobo bigint,
  p_approved_by uuid,
  p_submission_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_assignment public.project_assignments%rowtype;
  v_reservation public.project_assignment_reservations%rowtype;
  v_reference text;
  v_payment_id uuid;
  v_new_released bigint;
BEGIN
  PERFORM public.assert_project_assignment_payout_allowed(p_assignment_id);

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  v_reference := 'project_assignment_payout:' || p_idempotency_key;

  IF EXISTS (
    SELECT 1 FROM public.project_assignment_payments pay WHERE pay.wallet_reference = v_reference
  ) THEN
    RETURN (
      SELECT pay.id FROM public.project_assignment_payments pay WHERE pay.wallet_reference = v_reference
    );
  END IF;

  SELECT * INTO v_assignment
  FROM public.project_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  SELECT * INTO v_reservation
  FROM public.project_assignment_reservations r
  WHERE r.assignment_id = p_assignment_id
  FOR UPDATE;

  IF v_reservation.assignment_id IS NULL THEN
    RAISE EXCEPTION 'assignment compensation is not secured' USING errcode = '55000';
  END IF;

  IF v_reservation.released_kobo + p_total_kobo > v_reservation.amount_kobo THEN
    RAISE EXCEPTION 'payout would exceed secured assignment compensation' USING errcode = '55000';
  END IF;

  PERFORM public.wallet_credit_kobo(
    v_reference || ':payout',
    v_assignment.worker_id,
    p_provider_kobo,
    'project_assignment_payout'::public.wallet_transaction_type,
    'Project assignment payment',
    NULL,
    NULL,
    jsonb_build_object(
      'project_id', v_assignment.project_id,
      'assignment_id', p_assignment_id,
      'milestone_id', p_milestone_id
    )
  );

  UPDATE public.wallet_transactions wt
  SET project_id = v_assignment.project_id
  WHERE wt.reference = v_reference || ':payout';

  IF p_fee_kobo > 0 THEN
    PERFORM public.wallet_apply_entry(
      v_reference || ':fee',
      v_assignment.creator_id,
      NULL,
      'service_fee'::public.wallet_transaction_type,
      0,
      0,
      'Project assignment service fee',
      jsonb_build_object(
        'project_id', v_assignment.project_id,
        'assignment_id', p_assignment_id,
        'milestone_id', p_milestone_id
      ),
      NULL,
      p_fee_kobo
    );
  END IF;

  INSERT INTO public.project_assignment_payments (
    assignment_id,
    milestone_id,
    provider_kobo,
    fee_kobo,
    total_kobo,
    wallet_reference
  )
  VALUES (
    p_assignment_id,
    p_milestone_id,
    p_provider_kobo,
    p_fee_kobo,
    p_total_kobo,
    v_reference
  )
  RETURNING id INTO v_payment_id;

  IF p_submission_id IS NOT NULL THEN
    INSERT INTO public.project_assignment_approvals (
      submission_id,
      milestone_id,
      approved_by,
      payment_id
    )
    VALUES (
      p_submission_id,
      p_milestone_id,
      p_approved_by,
      v_payment_id
    );
  END IF;

  v_new_released := v_reservation.released_kobo + p_total_kobo;

  UPDATE public.project_assignment_reservations
  SET released_kobo = v_new_released
  WHERE assignment_id = p_assignment_id;

  IF p_milestone_id IS NOT NULL THEN
    UPDATE public.project_assignment_milestones
    SET status = 'approved_paid'::public.milestone_status,
        approved_at = now(),
        approved_by = p_approved_by,
        payout_reference = v_reference
    WHERE id = p_milestone_id;
  END IF;

  IF v_new_released = v_reservation.amount_kobo THEN
    UPDATE public.project_assignments
    SET status = 'completed'::public.project_assignment_status,
        completed_at = now(),
        updated_at = now()
    WHERE id = p_assignment_id;
  END IF;

  IF p_submission_id IS NOT NULL THEN
    PERFORM public.project_assignment_sync_submission_message_review(
      p_submission_id,
      CASE
        WHEN v_new_released = v_reservation.amount_kobo THEN 'approved_paid'
        ELSE 'milestone_paid'
      END
    );
  END IF;

  RETURN v_payment_id;
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
      AND (
        m.sender_id = v_user_id
        OR NOT (
          coalesce(m.metadata->>'draft_submission', '') = 'true'
          AND NOT (m.metadata ? 'submission_id')
        )
      )
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

CREATE OR REPLACE FUNCTION public.abort_request_message_with_attachments(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_conversation_id uuid;
BEGIN
  SELECT m.conversation_id
  INTO v_conversation_id
  FROM public.project_group_messages m
  WHERE m.id = p_message_id
    AND m.sender_id = v_user_id
    AND coalesce(m.metadata->>'draft_submission', '') = 'true'
    AND NOT (m.metadata ? 'submission_id');

  IF v_conversation_id IS NOT NULL THEN
    IF NOT public.request_conversation_is_accessible(v_conversation_id, v_user_id) THEN
      RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.project_group_message_attachments a
      WHERE a.message_id = p_message_id
        AND a.uploaded_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
    END IF;

    DELETE FROM storage.objects o
    USING public.project_group_message_attachments a
    WHERE a.message_id = p_message_id
      AND a.sender_id = v_user_id
      AND o.bucket_id = 'conversation-media'
      AND o.name = a.storage_path;

    DELETE FROM public.project_group_message_attachments a
    WHERE a.message_id = p_message_id
      AND a.sender_id = v_user_id;

    DELETE FROM public.project_group_messages m
    WHERE m.id = p_message_id
      AND m.sender_id = v_user_id;

    RETURN;
  END IF;

  SELECT m.conversation_id
  INTO v_conversation_id
  FROM public.request_messages m
  WHERE m.id = p_message_id
    AND m.sender_id = v_user_id
    AND m.message_type = 'text'::public.conversation_message_type;

  IF v_conversation_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.request_conversation_is_accessible(v_conversation_id, v_user_id) THEN
    RAISE EXCEPTION 'conversation not found or not accessible' USING errcode = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.request_message_attachments a
    WHERE a.message_id = p_message_id
      AND a.uploaded_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'We couldn''t upload this file. Try again.' USING errcode = '22023';
  END IF;

  DELETE FROM storage.objects o
  USING public.request_message_attachments a
  WHERE a.message_id = p_message_id
    AND a.sender_id = v_user_id
    AND o.bucket_id = 'conversation-media'
    AND o.name = a.storage_path;

  DELETE FROM public.request_message_attachments a
  WHERE a.message_id = p_message_id
    AND a.sender_id = v_user_id;

  DELETE FROM public.request_messages m
  WHERE m.id = p_message_id
    AND m.sender_id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.begin_project_assignment_submission(
  uuid, uuid, text, jsonb
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_project_assignment_submission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_assignment_submission_assert_may_submit(uuid, uuid, uuid) TO authenticated;