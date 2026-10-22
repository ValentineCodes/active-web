-- Wallet withdrawal user notifications (inbox + push) from trusted RPC transitions.

CREATE OR REPLACE FUNCTION public.notify_wallet_withdrawal_user(
  p_withdrawal_id uuid,
  p_stage text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_row public.wallet_withdrawals%rowtype;
  v_type public.notification_type;
  v_event_key text;
  v_title text;
  v_body text;
  v_url text;
  v_meta jsonb;
BEGIN
  SELECT * INTO v_row
  FROM public.wallet_withdrawals w
  WHERE w.id = p_withdrawal_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_url := '/wallet/withdrawal/' || v_row.id::text;
  v_meta := jsonb_build_object('withdrawal_id', v_row.id);

  CASE btrim(lower(p_stage))
    WHEN 'submitted' THEN
      v_type := 'withdrawal_submitted'::public.notification_type;
      v_event_key := 'withdrawal:' || v_row.id::text || ':submitted';
      v_title := 'Withdrawal submitted';
      v_body := 'Your withdrawal request has been submitted.';
    WHEN 'processing' THEN
      v_type := 'withdrawal_processing'::public.notification_type;
      v_event_key := 'withdrawal:' || v_row.id::text || ':processing';
      v_title := 'Withdrawal processing';
      v_body := 'Your withdrawal is being processed.';
    WHEN 'rejected' THEN
      v_type := 'withdrawal_failed'::public.notification_type;
      v_event_key := 'withdrawal:' || v_row.id::text || ':rejected';
      v_title := 'Withdrawal declined';
      v_body := 'Your withdrawal request was declined. Your reserved funds have been returned.';
    WHEN 'completed' THEN
      v_type := 'withdrawal_successful'::public.notification_type;
      v_event_key := 'withdrawal:' || v_row.id::text || ':completed';
      v_title := 'Withdrawal completed';
      v_body := 'Your withdrawal has been completed.';
    WHEN 'failed' THEN
      v_type := 'withdrawal_failed'::public.notification_type;
      v_event_key := 'withdrawal:' || v_row.id::text || ':failed';
      v_title := 'Withdrawal not completed';
      v_body := 'Your withdrawal could not be completed. Your reserved funds have been returned.';
    ELSE
      RAISE EXCEPTION 'unknown withdrawal notification stage: %', p_stage USING errcode = '22023';
  END CASE;

  BEGIN
    PERFORM public.create_notification(
      v_row.user_id,
      v_event_key,
      v_type,
      v_title,
      v_body,
      v_url,
      NULL,
      NULL,
      NULL,
      v_row.wallet_transaction_id,
      NULL,
      v_meta,
      true
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'notify_wallet_withdrawal_user(%): %', p_stage, SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_wallet_withdrawal_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_wallet_withdrawal_user(uuid, text) TO service_role;

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
      'request_expiring'::public.notification_type,
      'request_expired'::public.notification_type,
      'request_awaiting_review'::public.notification_type,
      'response_accepted'::public.notification_type,
      'response_not_selected'::public.notification_type,
      'completion_requested'::public.notification_type,
      'payment_secured'::public.notification_type,
      'funds_returned'::public.notification_type,
      'payment_released'::public.notification_type,
      'payment_received'::public.notification_type,
      'withdrawal_submitted'::public.notification_type,
      'withdrawal_processing'::public.notification_type,
      'withdrawal_successful'::public.notification_type,
      'withdrawal_failed'::public.notification_type,
      'new_message'::public.notification_type,
      'missed_call'::public.notification_type,
      'request_cancelled'::public.notification_type,
      'helper_cancelled'::public.notification_type,
      'cancellation_confirmed'::public.notification_type,
      'problem_reported'::public.notification_type,
      'dispute_opened'::public.notification_type,
      'dispute_resolved'::public.notification_type,
      'funds_released_after_resolution'::public.notification_type,
      'rate_experience'::public.notification_type
    ]
  );
$$;
CREATE OR REPLACE FUNCTION public."user_push_delivery_allowed"(
  "p_user_id" "uuid",
  "p_type" public."notification_type"
) RETURNS boolean
  LANGUAGE "sql" STABLE
  SET "search_path" TO ''
  AS $$
  select coalesce(
    (
      select case
        when p_type in (
          'dispute_opened'::public.notification_type,
          'dispute_resolved'::public.notification_type,
          'problem_reported'::public.notification_type
        ) then true
        when p_type = 'new_message'::public.notification_type then p.message_push_enabled
        when p_type = 'missed_call'::public.notification_type then p.push_calls_enabled
        when p_type in (
          'payment_secured'::public.notification_type,
          'funds_returned'::public.notification_type,
          'payment_released'::public.notification_type,
          'payment_received'::public.notification_type,
          'withdrawal_submitted'::public.notification_type,
          'withdrawal_processing'::public.notification_type,
          'withdrawal_successful'::public.notification_type,
          'withdrawal_failed'::public.notification_type,
          'funds_released_after_resolution'::public.notification_type
        ) then p.push_payments_wallet_enabled
        when p_type in (
          'rate_experience'::public.notification_type,
          'request_expiring'::public.notification_type,
          'request_expired'::public.notification_type
        ) then p.push_tips_reminders_enabled
        else p.push_notifications_enabled
      end
      from public.profiles p
      where p.id = p_user_id
    ),
    false
  );
$$;
CREATE OR REPLACE FUNCTION public.request_wallet_withdrawal(
  p_user_id uuid,
  p_amount_major numeric,
  p_bank_account_id uuid,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_ref text;
  v_kobo bigint;
  v_currency text;
  v_available bigint;
  v_bank public.user_bank_accounts%rowtype;
  v_tx_id uuid;
  v_withdrawal_id uuid;
  v_meta jsonb;
  v_key text := btrim(p_idempotency_key);
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING errcode = '22023';
  END IF;

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  IF p_amount_major IS NULL OR p_amount_major <= 0 THEN
    RAISE EXCEPTION 'amount must be positive' USING errcode = '22023';
  END IF;

  IF p_amount_major < 100 THEN
    RAISE EXCEPTION 'minimum withdrawal is 100 NGN' USING errcode = '22023';
  END IF;

  IF p_amount_major > 1000000 THEN
    RAISE EXCEPTION 'amount exceeds the per-operation limit' USING errcode = '22023';
  END IF;

  SELECT w.id
    INTO v_withdrawal_id
  FROM public.wallet_withdrawals w
  WHERE w.idempotency_key = v_key;

  IF v_withdrawal_id IS NOT NULL THEN
    RETURN v_withdrawal_id;
  END IF;

  v_ref := 'withdraw:' || v_key;

  SELECT wt.id
    INTO v_tx_id
  FROM public.wallet_transactions wt
  WHERE wt.reference = v_ref;

  IF v_tx_id IS NOT NULL THEN
    SELECT w.id
      INTO v_withdrawal_id
    FROM public.wallet_withdrawals w
    WHERE w.wallet_transaction_id = v_tx_id;

    IF v_withdrawal_id IS NOT NULL THEN
      RETURN v_withdrawal_id;
    END IF;

    RAISE EXCEPTION 'withdrawal ledger exists without queue row' USING errcode = '55000';
  END IF;

  SELECT *
    INTO v_bank
  FROM public.user_bank_accounts a
  WHERE a.id = p_bank_account_id
    AND a.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bank account not found' USING errcode = '22023';
  END IF;

  IF public.user_bank_account_pending_withdrawal_exists(p_user_id, p_bank_account_id) THEN
    RAISE EXCEPTION 'This account already has a withdrawal in progress'
      USING errcode = '55000';
  END IF;

  v_kobo := public.ngn_major_to_kobo(p_amount_major);

  PERFORM public.ensure_wallet_account(p_user_id);

  SELECT w.available_balance, w.currency
    INTO v_available, v_currency
  FROM public.wallets w
  WHERE w.user_id = p_user_id
  FOR UPDATE;

  IF v_available < v_kobo THEN
    RAISE EXCEPTION 'insufficient available balance' USING errcode = '55000';
  END IF;

  v_meta := jsonb_build_object(
    'bank_account_id', v_bank.id,
    'bank_code', v_bank.bank_code,
    'bank_name', v_bank.bank_name,
    'account_name', v_bank.account_name,
    'paystack_recipient_code', v_bank.paystack_recipient_code,
    'legacy_kind', 'manual_withdraw',
    'withdrawal_idempotency_key', v_key
  );

  v_tx_id := public.wallet_apply_entry(
    v_ref,
    p_user_id,
    NULL,
    'withdrawal'::public.wallet_transaction_type,
    -v_kobo,
    0,
    'Withdrawal to bank',
    v_meta,
    NULL,
    0,
    'pending'::public.wallet_transaction_status
  );

  INSERT INTO public.wallet_withdrawals (
    user_id,
    amount_kobo,
    currency,
    bank_account_id,
    destination_bank_code,
    destination_bank_name,
    destination_account_number,
    destination_account_name,
    paystack_recipient_code,
    status,
    idempotency_key,
    wallet_transaction_id
  )
  VALUES (
    p_user_id,
    v_kobo,
    v_currency,
    v_bank.id,
    v_bank.bank_code,
    v_bank.bank_name,
    v_bank.account_number,
    v_bank.account_name,
    v_bank.paystack_recipient_code,
    'pending'::public.wallet_withdrawal_status,
    v_key,
    v_tx_id
  )
  RETURNING id INTO v_withdrawal_id;

  PERFORM public.notify_wallet_withdrawal_user(v_withdrawal_id, 'submitted');

  RETURN v_withdrawal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_wallet_withdrawal(uuid, numeric, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_wallet_withdrawal(uuid, numeric, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_begin_wallet_withdrawal_processing(
  p_withdrawal_id uuid,
  p_idempotency_key text,
  p_admin_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.wallet_withdrawals%rowtype;
  v_key text := btrim(p_idempotency_key);
  v_existing uuid;
  v_notes text;
BEGIN
  PERFORM public.admin_require_permission('withdrawals');

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  SELECT a.id INTO v_existing
  FROM public.admin_audit_events a
  WHERE a.idempotency_key = v_key;

  IF v_existing IS NOT NULL THEN
    SELECT w.id INTO v_existing
    FROM public.wallet_withdrawals w
    WHERE w.id = p_withdrawal_id
      AND w.status = 'processing'::public.wallet_withdrawal_status;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_row
  FROM public.wallet_withdrawals w
  WHERE w.id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal not found' USING errcode = 'P0002';
  END IF;

  IF v_row.status = 'processing'::public.wallet_withdrawal_status THEN
    RETURN v_row.id;
  END IF;

  IF v_row.status <> 'pending'::public.wallet_withdrawal_status THEN
    RAISE EXCEPTION 'withdrawal cannot enter processing from status %', v_row.status
      USING errcode = '55000';
  END IF;

  v_notes := CASE
    WHEN p_admin_notes IS NULL OR btrim(p_admin_notes) = '' THEN v_row.admin_notes
    ELSE btrim(p_admin_notes)
  END;

  UPDATE public.wallet_withdrawals w
  SET
    status = 'processing'::public.wallet_withdrawal_status,
    approved_at = now(),
    approved_by = v_actor,
    processing_at = now(),
    processing_by = v_actor,
    admin_notes = v_notes
  WHERE w.id = v_row.id;

  PERFORM public.notify_wallet_withdrawal_user(v_row.id, 'processing');

  PERFORM public.admin_record_audit_event(
    'wallet_withdrawal_begin_processing',
    'wallet_withdrawal'::public.admin_audit_entity_type,
    v_row.id,
    NULL,
    v_key,
    jsonb_build_object(
      'previous_status', v_row.status::text,
      'new_status', 'processing',
      'wallet_transaction_id', v_row.wallet_transaction_id
    )
  );

  RETURN v_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_begin_wallet_withdrawal_processing(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_begin_wallet_withdrawal_processing(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_begin_wallet_withdrawal_processing(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_complete_wallet_withdrawal(
  p_withdrawal_id uuid,
  p_idempotency_key text,
  p_bank_transfer_reference text DEFAULT NULL,
  p_admin_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.wallet_withdrawals%rowtype;
  v_key text := btrim(p_idempotency_key);
  v_existing uuid;
  v_notes text;
  v_transfer_ref text;
BEGIN
  PERFORM public.admin_require_permission('withdrawals');

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  SELECT a.id INTO v_existing
  FROM public.admin_audit_events a
  WHERE a.idempotency_key = v_key
    AND a.entity_id = p_withdrawal_id;

  IF v_existing IS NOT NULL THEN
    SELECT w.id INTO v_existing
    FROM public.wallet_withdrawals w
    WHERE w.id = p_withdrawal_id
      AND w.status = 'completed'::public.wallet_withdrawal_status;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_row
  FROM public.wallet_withdrawals w
  WHERE w.id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal not found' USING errcode = 'P0002';
  END IF;

  IF v_row.status = 'completed'::public.wallet_withdrawal_status THEN
    RAISE EXCEPTION 'withdrawal is already completed' USING errcode = '55000';
  END IF;

  IF v_row.status <> 'processing'::public.wallet_withdrawal_status THEN
    RAISE EXCEPTION 'withdrawal must be processing to complete' USING errcode = '55000';
  END IF;

  v_transfer_ref := CASE
    WHEN p_bank_transfer_reference IS NULL THEN NULL
    ELSE btrim(p_bank_transfer_reference)
  END;

  v_notes := CASE
    WHEN p_admin_notes IS NULL OR btrim(p_admin_notes) = '' THEN v_row.admin_notes
    ELSE btrim(p_admin_notes)
  END;

  UPDATE public.wallet_transactions wt
  SET status = 'completed'::public.wallet_transaction_status
  WHERE wt.id = v_row.wallet_transaction_id
    AND wt.status = 'pending'::public.wallet_transaction_status;

  UPDATE public.wallet_withdrawals w
  SET
    status = 'completed'::public.wallet_withdrawal_status,
    completed_at = now(),
    completed_by = v_actor,
    bank_transfer_reference = v_transfer_ref,
    admin_notes = v_notes
  WHERE w.id = v_row.id;

  PERFORM public.notify_wallet_withdrawal_user(v_row.id, 'completed');

  PERFORM public.admin_record_audit_event(
    'wallet_withdrawal_complete',
    'wallet_withdrawal'::public.admin_audit_entity_type,
    v_row.id,
    NULL,
    v_key,
    jsonb_build_object(
      'previous_status', 'processing',
      'new_status', 'completed',
      'wallet_transaction_id', v_row.wallet_transaction_id,
      'bank_transfer_reference', v_transfer_ref
    )
  );

  RETURN v_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_complete_wallet_withdrawal(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_complete_wallet_withdrawal(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_complete_wallet_withdrawal(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_reject_wallet_withdrawal(
  p_withdrawal_id uuid,
  p_idempotency_key text,
  p_user_facing_reason text,
  p_admin_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.wallet_withdrawals%rowtype;
  v_key text := btrim(p_idempotency_key);
  v_existing uuid;
  v_reason text := btrim(p_user_facing_reason);
  v_notes text;
  v_release_ref text;
BEGIN
  PERFORM public.admin_require_permission('withdrawals');

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'user-facing reason is required' USING errcode = '22023';
  END IF;

  SELECT a.id INTO v_existing
  FROM public.admin_audit_events a
  WHERE a.idempotency_key = v_key
    AND a.entity_id = p_withdrawal_id;

  IF v_existing IS NOT NULL THEN
    SELECT w.id INTO v_existing
    FROM public.wallet_withdrawals w
    WHERE w.id = p_withdrawal_id
      AND w.status = 'rejected'::public.wallet_withdrawal_status;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_row
  FROM public.wallet_withdrawals w
  WHERE w.id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal not found' USING errcode = 'P0002';
  END IF;

  IF v_row.status = 'rejected'::public.wallet_withdrawal_status THEN
    RETURN v_row.id;
  END IF;

  IF v_row.status <> 'pending'::public.wallet_withdrawal_status THEN
    RAISE EXCEPTION 'only pending withdrawals can be rejected' USING errcode = '55000';
  END IF;

  v_notes := CASE
    WHEN p_admin_notes IS NULL OR btrim(p_admin_notes) = '' THEN v_row.admin_notes
    ELSE btrim(p_admin_notes)
  END;

  v_release_ref := 'withdrawal:' || v_row.id::text || ':release';

  PERFORM public.wallet_withdrawal_release_reservation(
    v_row.id,
    v_release_ref,
    'Withdrawal rejected — funds returned'
  );

  UPDATE public.wallet_withdrawals w
  SET
    status = 'rejected'::public.wallet_withdrawal_status,
    rejected_at = now(),
    rejected_by = v_actor,
    user_facing_reason = v_reason,
    admin_notes = v_notes
  WHERE w.id = v_row.id;

  PERFORM public.notify_wallet_withdrawal_user(v_row.id, 'rejected');

  PERFORM public.admin_record_audit_event(
    'wallet_withdrawal_reject',
    'wallet_withdrawal'::public.admin_audit_entity_type,
    v_row.id,
    v_reason,
    v_key,
    jsonb_build_object(
      'previous_status', 'pending',
      'new_status', 'rejected',
      'wallet_transaction_id', v_row.wallet_transaction_id,
      'release_transaction_id', (
        SELECT w2.release_transaction_id FROM public.wallet_withdrawals w2 WHERE w2.id = v_row.id
      )
    )
  );

  RETURN v_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reject_wallet_withdrawal(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reject_wallet_withdrawal(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_wallet_withdrawal(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_fail_wallet_withdrawal(
  p_withdrawal_id uuid,
  p_idempotency_key text,
  p_user_facing_reason text,
  p_admin_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.wallet_withdrawals%rowtype;
  v_key text := btrim(p_idempotency_key);
  v_existing uuid;
  v_reason text := btrim(p_user_facing_reason);
  v_notes text;
  v_release_ref text;
BEGIN
  PERFORM public.admin_require_permission('withdrawals');

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'user-facing reason is required' USING errcode = '22023';
  END IF;

  SELECT a.id INTO v_existing
  FROM public.admin_audit_events a
  WHERE a.idempotency_key = v_key
    AND a.entity_id = p_withdrawal_id;

  IF v_existing IS NOT NULL THEN
    SELECT w.id INTO v_existing
    FROM public.wallet_withdrawals w
    WHERE w.id = p_withdrawal_id
      AND w.status = 'failed'::public.wallet_withdrawal_status;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_row
  FROM public.wallet_withdrawals w
  WHERE w.id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal not found' USING errcode = 'P0002';
  END IF;

  IF v_row.status = 'failed'::public.wallet_withdrawal_status THEN
    RETURN v_row.id;
  END IF;

  IF v_row.status <> 'processing'::public.wallet_withdrawal_status THEN
    RAISE EXCEPTION 'only processing withdrawals can fail' USING errcode = '55000';
  END IF;

  v_notes := CASE
    WHEN p_admin_notes IS NULL OR btrim(p_admin_notes) = '' THEN v_row.admin_notes
    ELSE btrim(p_admin_notes)
  END;

  v_release_ref := 'withdrawal:' || v_row.id::text || ':release';

  PERFORM public.wallet_withdrawal_release_reservation(
    v_row.id,
    v_release_ref,
    'Withdrawal failed — funds returned'
  );

  UPDATE public.wallet_withdrawals w
  SET
    status = 'failed'::public.wallet_withdrawal_status,
    failed_at = now(),
    failed_by = v_actor,
    user_facing_reason = v_reason,
    admin_notes = v_notes
  WHERE w.id = v_row.id;

  PERFORM public.notify_wallet_withdrawal_user(v_row.id, 'failed');

  PERFORM public.admin_record_audit_event(
    'wallet_withdrawal_fail',
    'wallet_withdrawal'::public.admin_audit_entity_type,
    v_row.id,
    v_reason,
    v_key,
    jsonb_build_object(
      'previous_status', 'processing',
      'new_status', 'failed',
      'wallet_transaction_id', v_row.wallet_transaction_id,
      'release_transaction_id', (
        SELECT w2.release_transaction_id FROM public.wallet_withdrawals w2 WHERE w2.id = v_row.id
      )
    )
  );

  RETURN v_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_fail_wallet_withdrawal(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_fail_wallet_withdrawal(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fail_wallet_withdrawal(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_wallet_withdrawal(p_withdrawal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_row public.wallet_withdrawals%rowtype;
BEGIN
  SELECT * INTO v_row
  FROM public.wallet_withdrawals w
  WHERE w.id = p_withdrawal_id
    AND w.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal not found' USING errcode = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'withdrawal_id', v_row.id,
    'amount_kobo', v_row.amount_kobo,
    'currency', v_row.currency,
    'status', v_row.status::text,
    'destination_bank_name', v_row.destination_bank_name,
    'destination_bank_code', v_row.destination_bank_code,
    'destination_account_number_masked', public.mask_bank_account_number(v_row.destination_account_number),
    'destination_account_name', v_row.destination_account_name,
    'user_facing_reason', v_row.user_facing_reason,
    'wallet_transaction_id', v_row.wallet_transaction_id,
    'release_transaction_id', v_row.release_transaction_id,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at,
    'processing_at', v_row.processing_at,
    'completed_at', v_row.completed_at,
    'rejected_at', v_row.rejected_at,
    'failed_at', v_row.failed_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_wallet_withdrawal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_wallet_withdrawal(uuid) TO service_role;
