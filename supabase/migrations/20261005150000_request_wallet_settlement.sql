-- Completion (release to responder) and cancellation/refund wallet settlement.

CREATE OR REPLACE FUNCTION public.wallet_release_lock_kobo(
  p_reference text,
  p_request_id uuid,
  p_recipient_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_lock public.payment_locks%rowtype;
  v_release_ref text;
  v_payout_ref text;
  v_fee_ref text;
BEGIN
  IF p_reference IS NULL OR btrim(p_reference) = '' THEN
    RAISE EXCEPTION 'reference is required' USING errcode = '22023';
  END IF;

  IF p_recipient_user_id IS NULL THEN
    RAISE EXCEPTION 'recipient is required' USING errcode = '22023';
  END IF;

  v_release_ref := p_reference || ':escrow_release';
  v_payout_ref := p_reference || ':payout';
  v_fee_ref := p_reference || ':service_fee';

  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions wt WHERE wt.reference = v_payout_ref
  ) THEN
    UPDATE public.payment_locks pl
    SET status = 'released'::public.payment_lock_status
    WHERE pl.request_id = p_request_id
      AND pl.status <> 'released'::public.payment_lock_status;
    RETURN;
  END IF;

  SELECT * INTO v_lock
  FROM public.payment_locks pl
  WHERE pl.request_id = p_request_id
  FOR UPDATE;

  IF v_lock.request_id IS NULL THEN
    RAISE EXCEPTION 'payment lock not found' USING errcode = 'P0002';
  END IF;

  IF v_lock.status = 'released'::public.payment_lock_status THEN
    RETURN;
  END IF;

  IF v_lock.status <> 'active'::public.payment_lock_status THEN
    RAISE EXCEPTION 'payment lock is not releasable' USING errcode = '55000';
  END IF;

  PERFORM public.wallet_apply_entry(
    v_release_ref,
    v_lock.user_id,
    p_request_id,
    'escrow_release'::public.wallet_transaction_type,
    0,
    -v_lock.total,
    'Service payment completed',
    jsonb_build_object('legacy_kind', 'escrow_release')
  );

  PERFORM public.wallet_credit_kobo(
    v_payout_ref,
    p_recipient_user_id,
    v_lock.provider_amount,
    'payout'::public.wallet_transaction_type,
    'Payment received',
    NULL,
    p_request_id,
    jsonb_build_object('legacy_kind', 'pay_provider')
  );

  IF v_lock.service_fee > 0 THEN
    PERFORM public.wallet_apply_entry(
      v_fee_ref,
      v_lock.user_id,
      p_request_id,
      'service_fee'::public.wallet_transaction_type,
      0,
      0,
      'Service fee',
      jsonb_build_object('legacy_kind', 'service_fee'),
      NULL,
      v_lock.service_fee
    );
  END IF;

  UPDATE public.payment_locks pl
  SET status = 'released'::public.payment_lock_status
  WHERE pl.request_id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_refund_lock_kobo(
  p_reference text,
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_lock public.payment_locks%rowtype;
  v_refund_ref text;
BEGIN
  IF p_reference IS NULL OR btrim(p_reference) = '' THEN
    RAISE EXCEPTION 'reference is required' USING errcode = '22023';
  END IF;

  v_refund_ref := p_reference || ':refund';

  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions wt WHERE wt.reference = v_refund_ref
  ) THEN
    UPDATE public.payment_locks pl
    SET status = 'refunded'::public.payment_lock_status
    WHERE pl.request_id = p_request_id
      AND pl.status <> 'refunded'::public.payment_lock_status;
    RETURN;
  END IF;

  SELECT * INTO v_lock
  FROM public.payment_locks pl
  WHERE pl.request_id = p_request_id
  FOR UPDATE;

  IF v_lock.request_id IS NULL THEN
    RETURN;
  END IF;

  IF v_lock.status = 'refunded'::public.payment_lock_status THEN
    RETURN;
  END IF;

  IF v_lock.status <> 'active'::public.payment_lock_status THEN
    RAISE EXCEPTION 'payment lock is not refundable' USING errcode = '55000';
  END IF;

  PERFORM public.wallet_apply_entry(
    v_refund_ref,
    v_lock.user_id,
    p_request_id,
    'refund'::public.wallet_transaction_type,
    v_lock.total,
    -v_lock.total,
    'Funds returned',
    jsonb_build_object('legacy_kind', 'refund')
  );

  UPDATE public.payment_locks pl
  SET status = 'refunded'::public.payment_lock_status
  WHERE pl.request_id = p_request_id;
END;
$$;
