-- Request funding: atomic kobo lock via payment_locks + wallet_transactions (no double-lock).

CREATE OR REPLACE FUNCTION public.wallet_lock_funds_kobo(
  p_reference text,
  p_user_id uuid,
  p_request_id uuid,
  p_provider_amount_kobo bigint,
  p_service_fee_kobo bigint,
  p_total_kobo bigint,
  p_currency text DEFAULT 'NGN'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_wallet_id uuid;
  v_available bigint;
  v_existing_lock public.payment_locks%rowtype;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions wt WHERE wt.reference = p_reference
  ) THEN
    RETURN (
      SELECT wt.id FROM public.wallet_transactions wt WHERE wt.reference = p_reference
    );
  END IF;

  IF p_total_kobo IS NULL OR p_total_kobo <= 0 THEN
    RAISE EXCEPTION 'lock total must be positive' USING errcode = '22023';
  END IF;

  IF p_provider_amount_kobo + p_service_fee_kobo <> p_total_kobo THEN
    RAISE EXCEPTION 'lock amounts must sum to total' USING errcode = '22023';
  END IF;

  SELECT * INTO v_existing_lock
  FROM public.payment_locks pl
  WHERE pl.request_id = p_request_id
    AND pl.status = 'active'::public.payment_lock_status
  FOR UPDATE;

  IF v_existing_lock.request_id IS NOT NULL THEN
    RAISE EXCEPTION 'funds are already locked for this request' USING errcode = '55000';
  END IF;

  PERFORM public.ensure_wallet_account(p_user_id);

  SELECT w.id, w.available_balance
    INTO v_wallet_id, v_available
  FROM public.wallets w
  WHERE w.user_id = p_user_id
  FOR UPDATE;

  IF v_available < p_total_kobo THEN
    RAISE EXCEPTION 'insufficient wallet balance to fund this request' USING errcode = '55000';
  END IF;

  INSERT INTO public.payment_locks (
    wallet_id,
    user_id,
    request_id,
    provider_amount,
    service_fee,
    total,
    currency,
    bucket,
    status
  )
  VALUES (
    v_wallet_id,
    p_user_id,
    p_request_id,
    p_provider_amount_kobo,
    p_service_fee_kobo,
    p_total_kobo,
    p_currency,
    'locked'::public.payment_lock_bucket,
    'active'::public.payment_lock_status
  );

  RETURN public.wallet_apply_entry(
    p_reference,
    p_user_id,
    p_request_id,
    'escrow_lock'::public.wallet_transaction_type,
    -p_total_kobo,
    p_total_kobo,
    'Request funded',
    jsonb_build_object('legacy_kind', 'escrow_lock')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_adjust_active_lock_kobo(
  p_reference text,
  p_request_id uuid,
  p_new_provider_amount_kobo bigint,
  p_new_service_fee_kobo bigint,
  p_new_total_kobo bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_lock public.payment_locks%rowtype;
  v_delta bigint;
  v_available bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions wt WHERE wt.reference = p_reference
  ) THEN
    RETURN (
      SELECT wt.id FROM public.wallet_transactions wt WHERE wt.reference = p_reference
    );
  END IF;

  SELECT * INTO v_lock
  FROM public.payment_locks pl
  WHERE pl.request_id = p_request_id
    AND pl.status = 'active'::public.payment_lock_status
  FOR UPDATE;

  IF v_lock.request_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_new_provider_amount_kobo + p_new_service_fee_kobo <> p_new_total_kobo THEN
    RAISE EXCEPTION 'lock amounts must sum to total' USING errcode = '22023';
  END IF;

  IF v_lock.total = p_new_total_kobo THEN
    RETURN NULL;
  END IF;

  v_delta := p_new_total_kobo - v_lock.total;

  IF v_delta > 0 THEN
    SELECT w.available_balance INTO v_available
    FROM public.wallets w
    WHERE w.user_id = v_lock.user_id
    FOR UPDATE;

    IF v_available < v_delta THEN
      RAISE EXCEPTION 'insufficient wallet balance to accept this offer' USING errcode = '55000';
    END IF;

    PERFORM public.wallet_apply_entry(
      p_reference,
      v_lock.user_id,
      p_request_id,
      'escrow_top_up'::public.wallet_transaction_type,
      -v_delta,
      v_delta,
      'Offer increased',
      jsonb_build_object('legacy_kind', 'escrow_top_up')
    );
  ELSIF v_delta < 0 THEN
    PERFORM public.wallet_apply_entry(
      p_reference,
      v_lock.user_id,
      p_request_id,
      'escrow_partial_refund'::public.wallet_transaction_type,
      -v_delta,
      v_delta,
      'Offer reduced',
      jsonb_build_object('legacy_kind', 'escrow_partial_refund')
    );
  END IF;

  UPDATE public.payment_locks
  SET
    provider_amount = p_new_provider_amount_kobo,
    service_fee = p_new_service_fee_kobo,
    total = p_new_total_kobo
  WHERE request_id = p_request_id;

  RETURN (
    SELECT wt.id FROM public.wallet_transactions wt WHERE wt.reference = p_reference LIMIT 1
  );
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
  v_lock_ref text;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

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

  IF v_request.payment_status IN (
    'locked'::public.payment_status,
    'pending'::public.payment_status,
    'released'::public.payment_status,
    'disputed'::public.payment_status
  ) AND EXISTS (
    SELECT 1
    FROM public.payment_locks pl
    WHERE pl.request_id = p_request_id
      AND pl.status = 'active'::public.payment_lock_status
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_charge FROM public.compute_request_charge(v_request.offered_amount);

  v_lock_ref := p_idempotency_key || ':escrow_lock';

  PERFORM public.wallet_lock_funds_kobo(
    v_lock_ref,
    v_request.requester_id,
    p_request_id,
    public.ngn_major_to_kobo(v_charge.provider_amount),
    public.ngn_major_to_kobo(v_charge.service_fee),
    public.ngn_major_to_kobo(v_charge.total),
    v_request.currency
  );

  PERFORM public.apply_payment_transition(
    p_request_id,
    'locked'::public.payment_status,
    p_idempotency_key
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
  v_source public.requests%rowtype;
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

  PERFORM public.lock_request_escrow(v_request_id, 'create:' || v_request_id::text);

  RETURN v_request_id;
END;
$$;
