-- Wallet RPCs backed by wallets / wallet_transactions / payment_locks / deposit_transactions.

CREATE OR REPLACE FUNCTION public.ensure_wallet_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, phone)
  VALUES (NEW.id, NEW.phone)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_attendance (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.wallets (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.map_wallet_kind_to_type(p_kind text)
RETURNS public.wallet_transaction_type
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE p_kind
    WHEN 'external_deposit' THEN 'deposit'::public.wallet_transaction_type
    WHEN 'manual_top_up' THEN 'manual_top_up'::public.wallet_transaction_type
    WHEN 'manual_withdraw' THEN 'withdrawal'::public.wallet_transaction_type
    WHEN 'escrow_lock' THEN 'escrow_lock'::public.wallet_transaction_type
    WHEN 'escrow_top_up' THEN 'escrow_top_up'::public.wallet_transaction_type
    WHEN 'escrow_partial_refund' THEN 'escrow_partial_refund'::public.wallet_transaction_type
    WHEN 'escrow_pending' THEN 'escrow_pending'::public.wallet_transaction_type
    WHEN 'escrow_relock' THEN 'escrow_relock'::public.wallet_transaction_type
    WHEN 'escrow_release' THEN 'escrow_release'::public.wallet_transaction_type
    WHEN 'pay_provider' THEN 'payout'::public.wallet_transaction_type
    WHEN 'refund' THEN 'refund'::public.wallet_transaction_type
    WHEN 'service_fee' THEN 'service_fee'::public.wallet_transaction_type
    ELSE 'adjustment'::public.wallet_transaction_type
  END;
$$;

CREATE OR REPLACE FUNCTION public.post_wallet_ledger(
  p_idempotency_key text,
  p_user_id uuid,
  p_request_id uuid,
  p_kind text,
  p_available_delta numeric,
  p_locked_delta numeric,
  p_pending_delta numeric,
  p_platform_available_delta numeric DEFAULT 0,
  p_external_reference text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_wallet public.wallets%rowtype;
  v_audit_user_id uuid := p_user_id;
  v_avail_kobo bigint;
  v_held_kobo bigint;
  v_platform_kobo bigint;
  v_amount bigint;
  v_metadata jsonb;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions wt WHERE wt.reference = p_idempotency_key
  ) THEN
    RETURN;
  END IF;

  v_avail_kobo := public.ngn_major_to_kobo(coalesce(p_available_delta, 0));
  v_held_kobo := public.ngn_major_to_kobo(coalesce(p_locked_delta, 0) + coalesce(p_pending_delta, 0));
  v_platform_kobo := public.ngn_major_to_kobo(coalesce(p_platform_available_delta, 0));

  IF v_audit_user_id IS NULL AND p_request_id IS NOT NULL THEN
    SELECT r.requester_id INTO v_audit_user_id
    FROM public.requests r
    WHERE r.id = p_request_id;
  END IF;

  IF v_audit_user_id IS NOT NULL THEN
    PERFORM public.ensure_wallet_account(v_audit_user_id);

    SELECT * INTO v_wallet
    FROM public.wallets w
    WHERE w.user_id = v_audit_user_id
    FOR UPDATE;

    IF v_avail_kobo <> 0 OR v_held_kobo <> 0 THEN
      UPDATE public.wallets
      SET
        available_balance = available_balance + v_avail_kobo,
        locked_balance = locked_balance + v_held_kobo
      WHERE user_id = v_audit_user_id;

      SELECT * INTO v_wallet
      FROM public.wallets w
      WHERE w.user_id = v_audit_user_id;

      IF v_wallet.available_balance < 0 OR v_wallet.locked_balance < 0 THEN
        RAISE EXCEPTION 'wallet balance cannot go negative' USING errcode = '55000';
      END IF;
    END IF;

    v_metadata := jsonb_build_object(
      'legacy_kind', p_kind,
      'available_delta_kobo', v_avail_kobo,
      'locked_delta_kobo', public.ngn_major_to_kobo(coalesce(p_locked_delta, 0)),
      'pending_delta_kobo', public.ngn_major_to_kobo(coalesce(p_pending_delta, 0)),
      'platform_delta_kobo', v_platform_kobo
    );

    v_amount := abs(v_avail_kobo) + abs(v_held_kobo);
    IF v_amount = 0 AND v_platform_kobo <> 0 THEN
      v_amount := abs(v_platform_kobo);
    END IF;

    INSERT INTO public.wallet_transactions (
      wallet_id,
      user_id,
      type,
      amount,
      status,
      reference,
      request_id,
      paystack_reference,
      metadata
    )
    VALUES (
      v_wallet.id,
      v_audit_user_id,
      public.map_wallet_kind_to_type(p_kind),
      v_amount,
      'completed'::public.wallet_transaction_status,
      p_idempotency_key,
      p_request_id,
      CASE WHEN p_kind = 'external_deposit' THEN p_external_reference ELSE NULL END,
      v_metadata
    );
  END IF;

  IF v_platform_kobo <> 0 THEN
    UPDATE public.platform_wallet
    SET
      available = available + v_platform_kobo,
      updated_at = now()
    WHERE id = 1;

    IF (SELECT available FROM public.platform_wallet WHERE id = 1) < 0 THEN
      RAISE EXCEPTION 'platform wallet cannot go negative' USING errcode = '55000';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_request_escrow(p_request_id uuid, p_idempotency_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_request public.requests%rowtype;
  v_charge record;
  v_wallet_id uuid;
BEGIN
  SELECT * INTO v_request
  FROM public.requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'request not found' USING errcode = 'P0002';
  END IF;

  IF v_request.offered_amount IS NULL OR v_request.offered_amount <= 0 THEN
    RETURN;
  END IF;

  SELECT * INTO v_charge FROM public.compute_request_charge(v_request.offered_amount);

  PERFORM public.ensure_wallet_account(v_request.requester_id);

  SELECT w.id INTO v_wallet_id
  FROM public.wallets w
  WHERE w.user_id = v_request.requester_id;

  INSERT INTO public.payment_locks (
    wallet_id,
    user_id,
    request_id,
    provider_amount,
    service_fee,
    total,
    currency,
    bucket
  )
  VALUES (
    v_wallet_id,
    v_request.requester_id,
    p_request_id,
    public.ngn_major_to_kobo(v_charge.provider_amount),
    public.ngn_major_to_kobo(v_charge.service_fee),
    public.ngn_major_to_kobo(v_charge.total),
    v_request.currency,
    'locked'::public.payment_lock_bucket
  )
  ON CONFLICT (request_id) DO NOTHING;

  PERFORM public.post_wallet_ledger(
    p_idempotency_key || ':escrow_lock',
    v_request.requester_id,
    p_request_id,
    'escrow_lock',
    -v_charge.total,
    v_charge.total,
    0
  );

  PERFORM public.apply_payment_transition(
    p_request_id,
    'locked'::public.payment_status,
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.align_request_escrow_to_agreed_amount(
  p_request_id uuid,
  p_agreed_provider_amount numeric,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_lock public.payment_locks%rowtype;
  v_new_charge record;
  v_delta_total numeric;
  v_requester_id uuid;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  IF p_agreed_provider_amount IS NULL OR p_agreed_provider_amount <= 0 THEN
    RAISE EXCEPTION 'agreed amount must be positive' USING errcode = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions wt
    WHERE wt.reference = p_idempotency_key || ':align'
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_lock
  FROM public.payment_locks pl
  WHERE pl.request_id = p_request_id
  FOR UPDATE;

  IF v_lock.request_id IS NULL THEN
    RETURN;
  END IF;

  IF public.kobo_to_ngn_major(v_lock.provider_amount) = p_agreed_provider_amount THEN
    RETURN;
  END IF;

  SELECT * INTO v_new_charge FROM public.compute_request_charge(p_agreed_provider_amount);

  v_delta_total := v_new_charge.total - public.kobo_to_ngn_major(v_lock.total);
  v_requester_id := v_lock.user_id;

  IF v_delta_total > 0 THEN
    PERFORM public.ensure_wallet_account(v_requester_id);

    IF (
      SELECT w.available_balance
      FROM public.wallets w
      WHERE w.user_id = v_requester_id
    ) < public.ngn_major_to_kobo(v_delta_total) THEN
      RAISE EXCEPTION 'insufficient wallet balance to accept this offer' USING errcode = '55000';
    END IF;

    PERFORM public.post_wallet_ledger(
      p_idempotency_key || ':align',
      v_requester_id,
      p_request_id,
      'escrow_top_up',
      -v_delta_total,
      v_delta_total,
      0
    );
  ELSIF v_delta_total < 0 THEN
    PERFORM public.post_wallet_ledger(
      p_idempotency_key || ':align',
      v_requester_id,
      p_request_id,
      'escrow_partial_refund',
      -v_delta_total,
      v_delta_total,
      0
    );
  END IF;

  UPDATE public.payment_locks
  SET
    provider_amount = public.ngn_major_to_kobo(v_new_charge.provider_amount),
    service_fee = public.ngn_major_to_kobo(v_new_charge.service_fee),
    total = public.ngn_major_to_kobo(v_new_charge.total)
  WHERE request_id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_wallet_payment_transition(
  p_request_id uuid,
  p_from public.payment_status,
  p_to public.payment_status,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_lock public.payment_locks%rowtype;
  v_selected_user_id uuid;
  v_total_major numeric;
  v_provider_major numeric;
  v_fee_major numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.payment_locks pl WHERE pl.request_id = p_request_id) THEN
    RETURN;
  END IF;

  SELECT * INTO v_lock
  FROM public.payment_locks pl
  WHERE pl.request_id = p_request_id;

  v_total_major := public.kobo_to_ngn_major(v_lock.total);
  v_provider_major := public.kobo_to_ngn_major(v_lock.provider_amount);
  v_fee_major := public.kobo_to_ngn_major(v_lock.service_fee);

  SELECT r.selected_user_id INTO v_selected_user_id
  FROM public.requests r
  WHERE r.id = p_request_id;

  IF p_from = 'locked' AND p_to = 'pending' THEN
    PERFORM public.post_wallet_ledger(
      p_idempotency_key || ':escrow_pending',
      v_lock.user_id,
      p_request_id,
      'escrow_pending',
      0,
      -v_total_major,
      v_total_major
    );

    UPDATE public.payment_locks
    SET bucket = 'pending'::public.payment_lock_bucket
    WHERE request_id = p_request_id;
  ELSIF p_from = 'pending' AND p_to = 'released' THEN
    IF v_selected_user_id IS NULL THEN
      RAISE EXCEPTION 'cannot release escrow without a selected user' USING errcode = '55000';
    END IF;

    PERFORM public.post_wallet_ledger(
      p_idempotency_key || ':escrow_release',
      v_lock.user_id,
      p_request_id,
      'escrow_release',
      0,
      0,
      -v_total_major
    );

    PERFORM public.post_wallet_ledger(
      p_idempotency_key || ':pay_provider',
      v_selected_user_id,
      p_request_id,
      'pay_provider',
      v_provider_major,
      0,
      0
    );

    PERFORM public.post_wallet_ledger(
      p_idempotency_key || ':service_fee',
      NULL,
      p_request_id,
      'service_fee',
      0,
      0,
      0,
      v_fee_major
    );
  ELSIF p_from = 'locked' AND p_to = 'refunded' THEN
    PERFORM public.post_wallet_ledger(
      p_idempotency_key || ':refund',
      v_lock.user_id,
      p_request_id,
      'refund',
      v_total_major,
      -v_total_major,
      0
    );
  ELSIF p_from = 'pending' AND p_to = 'refunded' THEN
    PERFORM public.post_wallet_ledger(
      p_idempotency_key || ':refund',
      v_lock.user_id,
      p_request_id,
      'refund',
      v_total_major,
      0,
      -v_total_major
    );
  ELSIF p_from = 'disputed' AND p_to = 'released' THEN
    IF v_selected_user_id IS NULL THEN
      RAISE EXCEPTION 'cannot release escrow without a selected user' USING errcode = '55000';
    END IF;

    IF v_lock.bucket = 'pending'::public.payment_lock_bucket THEN
      PERFORM public.post_wallet_ledger(
        p_idempotency_key || ':escrow_release',
        v_lock.user_id,
        p_request_id,
        'escrow_release',
        0,
        0,
        -v_total_major
      );
    ELSE
      PERFORM public.post_wallet_ledger(
        p_idempotency_key || ':escrow_release',
        v_lock.user_id,
        p_request_id,
        'escrow_release',
        0,
        -v_total_major,
        0
      );
    END IF;

    PERFORM public.post_wallet_ledger(
      p_idempotency_key || ':pay_provider',
      v_selected_user_id,
      p_request_id,
      'pay_provider',
      v_provider_major,
      0,
      0
    );

    PERFORM public.post_wallet_ledger(
      p_idempotency_key || ':service_fee',
      NULL,
      p_request_id,
      'service_fee',
      0,
      0,
      0,
      v_fee_major
    );
  ELSIF p_from = 'disputed' AND p_to = 'refunded' THEN
    IF v_lock.bucket = 'pending'::public.payment_lock_bucket THEN
      PERFORM public.post_wallet_ledger(
        p_idempotency_key || ':refund',
        v_lock.user_id,
        p_request_id,
        'refund',
        v_total_major,
        0,
        -v_total_major
      );
    ELSE
      PERFORM public.post_wallet_ledger(
        p_idempotency_key || ':refund',
        v_lock.user_id,
        p_request_id,
        'refund',
        v_total_major,
        -v_total_major,
        0
      );
    END IF;
  ELSIF p_from = 'disputed' AND p_to = 'pending' THEN
    IF v_lock.bucket = 'locked'::public.payment_lock_bucket THEN
      PERFORM public.post_wallet_ledger(
        p_idempotency_key || ':escrow_pending',
        v_lock.user_id,
        p_request_id,
        'escrow_pending',
        0,
        -v_total_major,
        v_total_major
      );

      UPDATE public.payment_locks
      SET bucket = 'pending'::public.payment_lock_bucket
      WHERE request_id = p_request_id;
    END IF;
  ELSIF p_from = 'disputed' AND p_to = 'locked' THEN
    IF v_lock.bucket = 'pending'::public.payment_lock_bucket THEN
      PERFORM public.post_wallet_ledger(
        p_idempotency_key || ':escrow_relock',
        v_lock.user_id,
        p_request_id,
        'escrow_relock',
        0,
        v_total_major,
        -v_total_major
      );

      UPDATE public.payment_locks
      SET bucket = 'locked'::public.payment_lock_bucket
      WHERE request_id = p_request_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_record_deposit(
  p_user_id uuid,
  p_amount_kobo bigint,
  p_idempotency_key text,
  p_paystack_reference text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_wallet_id uuid;
  v_deposit_id uuid;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin', 'service_role')
     AND coalesce(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 THEN
    RAISE EXCEPTION 'deposit amount must be positive' USING errcode = '22023';
  END IF;

  IF p_paystack_reference IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.deposit_transactions dt
    WHERE dt.paystack_reference = p_paystack_reference
      AND dt.status = 'completed'::public.deposit_transaction_status
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions wt WHERE wt.reference = p_idempotency_key
  ) THEN
    RETURN;
  END IF;

  PERFORM public.ensure_wallet_account(p_user_id);

  SELECT w.id INTO v_wallet_id
  FROM public.wallets w
  WHERE w.user_id = p_user_id;

  INSERT INTO public.deposit_transactions (
    user_id,
    wallet_id,
    amount,
    reference,
    paystack_reference,
    status
  )
  VALUES (
    p_user_id,
    v_wallet_id,
    p_amount_kobo,
    p_idempotency_key,
    p_paystack_reference,
    'processing'::public.deposit_transaction_status
  )
  ON CONFLICT (reference) DO NOTHING
  RETURNING id INTO v_deposit_id;

  IF v_deposit_id IS NULL THEN
    SELECT dt.id INTO v_deposit_id
    FROM public.deposit_transactions dt
    WHERE dt.reference = p_idempotency_key;

    IF EXISTS (
      SELECT 1
      FROM public.deposit_transactions dt
      WHERE dt.id = v_deposit_id
        AND dt.status = 'completed'::public.deposit_transaction_status
    ) THEN
      RETURN;
    END IF;
  END IF;

  PERFORM public.post_wallet_ledger(
    p_idempotency_key,
    p_user_id,
    NULL,
    'external_deposit',
    public.kobo_to_ngn_major(p_amount_kobo),
    0,
    0,
    0,
    p_paystack_reference
  );

  UPDATE public.deposit_transactions dt
  SET
    status = 'completed'::public.deposit_transaction_status,
    completed_at = now(),
    wallet_transaction_id = (
      SELECT wt.id
      FROM public.wallet_transactions wt
      WHERE wt.reference = p_idempotency_key
    )
  WHERE dt.reference = p_idempotency_key;
END;
$$;

DROP FUNCTION IF EXISTS public.wallet_record_deposit(uuid, numeric, text, text);

CREATE OR REPLACE FUNCTION public.wallet_top_up(p_amount numeric, p_idempotency_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive' USING errcode = '22023';
  END IF;

  IF p_amount > 1000000 THEN
    RAISE EXCEPTION 'amount exceeds the per-operation limit' USING errcode = '22023';
  END IF;

  PERFORM public.post_wallet_ledger(
    'manual_top_up:' || p_idempotency_key,
    v_user_id,
    NULL,
    'manual_top_up',
    p_amount,
    0,
    0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_withdraw(p_amount numeric, p_idempotency_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_available_kobo bigint;
  v_ledger_id uuid;
  v_currency text;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive' USING errcode = '22023';
  END IF;

  IF p_amount > 1000000 THEN
    RAISE EXCEPTION 'amount exceeds the per-operation limit' USING errcode = '22023';
  END IF;

  PERFORM public.ensure_wallet_account(v_user_id);

  SELECT w.available_balance, w.currency
    INTO v_available_kobo, v_currency
  FROM public.wallets w
  WHERE w.user_id = v_user_id;

  IF v_available_kobo < public.ngn_major_to_kobo(p_amount) THEN
    RAISE EXCEPTION 'insufficient available balance to withdraw' USING errcode = '55000';
  END IF;

  PERFORM public.create_notification(
    v_user_id,
    'withdraw:' || p_idempotency_key || ':processing',
    'withdrawal_processing'::public.notification_type,
    'Withdrawal processing',
    format(
      'We are processing your withdrawal of %s %s.',
      trim(to_char(p_amount, 'FM999999990.00')),
      v_currency
    ),
    '/wallet',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    false
  );

  PERFORM public.post_wallet_ledger(
    'manual_withdraw:' || p_idempotency_key,
    v_user_id,
    NULL,
    'manual_withdraw',
    -p_amount,
    0,
    0
  );

  SELECT wt.id INTO v_ledger_id
  FROM public.wallet_transactions wt
  WHERE wt.reference = 'manual_withdraw:' || p_idempotency_key;

  PERFORM public.create_notification(
    v_user_id,
    'withdraw:' || p_idempotency_key || ':success',
    'withdrawal_successful'::public.notification_type,
    'Withdrawal successful',
    format(
      '%s %s has been withdrawn from your available balance.',
      trim(to_char(p_amount, 'FM999999990.00')),
      v_currency
    ),
    '/wallet',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    v_ledger_id,
    false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_request(
  p_title text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_scheduled_for timestamp with time zone DEFAULT NULL,
  p_offered_amount numeric DEFAULT NULL,
  p_source_request_id uuid DEFAULT NULL,
  p_attachment_path text DEFAULT NULL
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
  v_payment public.payment_status;
  v_source public.requests%rowtype;
  v_charge record;
BEGIN
  IF char_length(btrim(p_title)) < 3 OR char_length(btrim(p_title)) > 120 THEN
    RAISE EXCEPTION 'title must be between 3 and 120 characters' USING errcode = '22023';
  END IF;

  IF v_description IS NOT NULL
     AND (char_length(v_description) < 1 OR char_length(v_description) > 1000) THEN
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

  SELECT * INTO v_charge FROM public.compute_request_charge(p_offered_amount);

  PERFORM public.ensure_wallet_account(v_user_id);

  IF (
    SELECT w.available_balance
    FROM public.wallets w
    WHERE w.user_id = v_user_id
  ) < public.ngn_major_to_kobo(v_charge.total) THEN
    RAISE EXCEPTION 'insufficient wallet balance to fund this request' USING errcode = '55000';
  END IF;

  v_payment := 'not_required';

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
    v_payment,
    v_location,
    btrim(p_location_label),
    'posted',
    now(),
    public.request_expires_at(p_scheduled_for),
    p_source_request_id,
    p_attachment_path
  )
  RETURNING id INTO v_request_id;

  PERFORM public.lock_request_escrow(v_request_id, 'create:' || v_request_id::text);

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.map_wallet_kind_to_type(text) TO service_role;

REVOKE ALL ON FUNCTION public.wallet_record_deposit(uuid, bigint, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wallet_record_deposit(uuid, bigint, text, text) TO service_role;
