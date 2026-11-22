-- Project assignment submit/payout: centered chat timeline rows (not submission bubble updates).

CREATE OR REPLACE FUNCTION public.append_project_group_assignment_system_message(
  p_conversation_id uuid,
  p_lifecycle_key text,
  p_body text,
  p_sender_id uuid,
  p_extra_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_existing_id uuid;
  v_message_id uuid;
BEGIN
  IF p_conversation_id IS NULL
     OR p_lifecycle_key IS NULL
     OR btrim(p_lifecycle_key) = ''
     OR p_body IS NULL
     OR btrim(p_body) = ''
     OR p_sender_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT m.id
  INTO v_existing_id
  FROM public.project_group_messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.message_type = 'system'::public.conversation_message_type
    AND m.metadata ->> 'lifecycle_key' = btrim(p_lifecycle_key)
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  PERFORM set_config('request.conversation_system_message', '1', true);

  INSERT INTO public.project_group_messages (
    conversation_id,
    sender_id,
    message_type,
    body,
    metadata
  )
  VALUES (
    p_conversation_id,
    p_sender_id,
    'system'::public.conversation_message_type,
    btrim(p_body),
    jsonb_build_object(
      'event', 'project_assignment_lifecycle',
      'lifecycle_key', btrim(p_lifecycle_key)
    ) || coalesce(p_extra_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_message_id;

  PERFORM set_config('request.conversation_system_message', '', true);

  RETURN v_message_id;
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
  v_sender_name text;
  v_sender_first text;
  v_terms_title text;
  v_project_id uuid;
BEGIN
  SELECT m.conversation_id, m.metadata, m.body
  INTO v_conversation_id, v_metadata, v_note
  FROM public.project_group_messages m
  WHERE m.id = p_message_id
    AND m.sender_id = v_user_id
  FOR UPDATE;

  IF v_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Could not submit deliverables. Try again.' USING errcode = '42501';
  END IF;

  IF coalesce(v_metadata->>'draft_submission', '') <> 'true' THEN
    SELECT s.id INTO v_submission_id
    FROM public.project_assignment_submissions s
    WHERE s.group_message_id = p_message_id;

    IF v_submission_id IS NOT NULL THEN
      RETURN v_submission_id;
    END IF;

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

  IF EXISTS (
    SELECT 1
    FROM public.project_group_message_attachments a
    WHERE a.message_id = p_message_id
      AND a.sender_id = v_user_id
      AND a.uploaded_at IS NULL
  ) THEN
    PERFORM public.complete_request_message_with_attachments(p_message_id);
  END IF;

  SELECT coalesce(array_agg(a.storage_path ORDER BY a.created_at), '{}'::text[])
  INTO v_paths
  FROM public.project_group_message_attachments a
  WHERE a.message_id = p_message_id
    AND a.sender_id = v_user_id
    AND a.uploaded_at IS NOT NULL;

  IF nullif(btrim(v_note), '') IS NULL AND cardinality(v_paths) < 1 THEN
    RAISE EXCEPTION 'Add a message or at least one file' USING errcode = '22023';
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

  UPDATE public.project_group_messages
  SET
    metadata = NULL,
    updated_at = now()
  WHERE id = p_message_id;

  SELECT prof.display_name INTO v_sender_name
  FROM public.profiles prof
  WHERE prof.id = v_user_id;

  v_sender_first := coalesce(public.display_first_name(v_sender_name), 'Someone');

  SELECT a.project_id, t.title
  INTO v_project_id, v_terms_title
  FROM public.project_assignments a
  JOIN public.project_assignment_terms t ON t.id = a.active_terms_id
  WHERE a.id = v_assignment_id;

  PERFORM public.append_project_group_assignment_system_message(
    v_conversation_id,
    'assignment_submitted:' || v_submission_id::text,
    format('%s says the work is done', v_sender_first),
    v_user_id,
    jsonb_build_object(
      'submission_id', v_submission_id::text,
      'assignment_id', v_assignment_id::text,
      'project_id', v_project_id::text,
      'assignment_title', coalesce(v_terms_title, '')
    )
  );

  UPDATE public.project_group_conversations SET updated_at = now() WHERE id = v_conversation_id;

  RETURN v_submission_id;
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
  v_conversation_id uuid;
  v_worker_name text;
  v_worker_first text;
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
    v_conversation_id := public.ensure_project_group_conversation(v_assignment.project_id);

    SELECT prof.display_name INTO v_worker_name
    FROM public.profiles prof
    WHERE prof.id = v_assignment.worker_id;

    v_worker_first := coalesce(public.display_first_name(v_worker_name), 'the worker');

    PERFORM public.append_project_group_assignment_system_message(
      v_conversation_id,
      'assignment_payment_released:' || v_payment_id::text,
      format('Payment has been released to %s', v_worker_first),
      p_approved_by,
      jsonb_build_object(
        'submission_id', p_submission_id::text,
        'assignment_id', p_assignment_id::text,
        'project_id', v_assignment.project_id::text,
        'payment_id', v_payment_id::text,
        'worker_id', v_assignment.worker_id::text
      )
    );
  END IF;

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_assignment_sync_submission_message_review(
  p_submission_id uuid,
  p_review_state text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN;
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
  v_lifecycle_key text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.metadata->>'draft_submission', '') = 'true'
    AND NOT (NEW.metadata ? 'submission_id') THEN
    RETURN NEW;
  END IF;

  v_lifecycle_key := coalesce(NEW.metadata->>'lifecycle_key', '');

  IF NEW.message_type = 'system'::public.conversation_message_type THEN
    IF coalesce(NEW.metadata->>'event', '') <> 'project_assignment_lifecycle'
       OR v_lifecycle_key NOT LIKE 'assignment_submitted:%' THEN
      RETURN NEW;
    END IF;
    v_is_submission := true;
  ELSE
    v_is_submission := coalesce(NEW.metadata->>'kind', '') = 'project_assignment_submission';
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

DROP TRIGGER IF EXISTS project_group_messages_notify_update ON public.project_group_messages;

GRANT EXECUTE ON FUNCTION public.append_project_group_assignment_system_message(
  uuid, text, text, uuid, jsonb
) TO postgres;