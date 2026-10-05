-- Service fee is deducted from the offer at payout (provider receives 90%, platform 10%).
-- Requesters lock only the offer amount, not offer + fee.

CREATE OR REPLACE FUNCTION public.compute_request_charge(p_provider_amount numeric)
RETURNS TABLE (
  provider_amount numeric,
  service_fee numeric,
  total numeric
)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT
    p_provider_amount - round(p_provider_amount * 0.1, 0) AS provider_amount,
    round(p_provider_amount * 0.1, 0) AS service_fee,
    p_provider_amount AS total;
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

  IF v_lock.total = p_new_total_kobo
     AND v_lock.provider_amount = p_new_provider_amount_kobo
     AND v_lock.service_fee = p_new_service_fee_kobo THEN
    RETURN NULL;
  END IF;

  v_delta := p_new_total_kobo - v_lock.total;

  IF v_delta > 0 THEN
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
    SELECT wt.id
    FROM public.wallet_transactions wt
    WHERE wt.reference = p_reference
  );
END;
$$;
