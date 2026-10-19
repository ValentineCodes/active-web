-- Request a wallet withdrawal to a saved bank account: pending ledger row + processing notification.
-- Paystack transfer initiation and settlement are handled separately (service_role jobs).

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
  v_meta jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING errcode = '22023';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
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

  v_ref := 'withdraw:' || btrim(p_idempotency_key);

  SELECT wt.id
    INTO v_tx_id
  FROM public.wallet_transactions wt
  WHERE wt.reference = v_ref;

  IF v_tx_id IS NOT NULL THEN
    RETURN v_tx_id;
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
    'legacy_kind', 'manual_withdraw'
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

  PERFORM public.create_notification(
    p_user_id,
    'withdraw:' || btrim(p_idempotency_key) || ':processing',
    'withdrawal_processing'::public.notification_type,
    'Withdrawal processing',
    format(
      'We are processing your withdrawal of %s %s to %s.',
      trim(to_char(p_amount_major, 'FM999999990.00')),
      v_currency,
      v_bank.bank_name
    ),
    '/wallet',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    v_tx_id,
    false
  );

  RETURN v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_wallet_withdrawal(uuid, numeric, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_wallet_withdrawal(uuid, numeric, uuid, text) TO service_role;
