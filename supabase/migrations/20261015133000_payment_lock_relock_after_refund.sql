-- Re-accept after engagement cancellation refunds escrow but keeps the payment_locks row
-- (request_id is unique). Reactivate that row instead of inserting a second one.

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
  FOR UPDATE;

  IF v_existing_lock.request_id IS NOT NULL
     AND v_existing_lock.status = 'active'::public.payment_lock_status THEN
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

  IF v_existing_lock.request_id IS NOT NULL THEN
    IF v_existing_lock.status NOT IN (
      'refunded'::public.payment_lock_status,
      'released'::public.payment_lock_status
    ) THEN
      RAISE EXCEPTION 'payment lock exists in an unexpected state' USING errcode = '55000';
    END IF;

    UPDATE public.payment_locks
    SET wallet_id = v_wallet_id,
        user_id = p_user_id,
        provider_amount = p_provider_amount_kobo,
        service_fee = p_service_fee_kobo,
        total = p_total_kobo,
        currency = p_currency,
        bucket = 'locked'::public.payment_lock_bucket,
        status = 'active'::public.payment_lock_status,
        updated_at = now()
    WHERE request_id = p_request_id;
  ELSE
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
  END IF;

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
