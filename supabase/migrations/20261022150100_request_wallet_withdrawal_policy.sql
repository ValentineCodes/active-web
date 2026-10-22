-- Enforce configurable withdrawal_policy in request_wallet_withdrawal.

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
  v_policy public.withdrawal_policy;
  v_day date;
  v_daily_spent bigint;
  v_initial_status public.wallet_withdrawal_status;
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

  SELECT * INTO v_policy FROM public.get_withdrawal_policy();

  IF NOT v_policy.withdrawals_enabled THEN
    RAISE EXCEPTION 'withdrawals are temporarily disabled' USING errcode = '55000';
  END IF;

  v_kobo := public.ngn_major_to_kobo(p_amount_major);

  IF v_kobo < v_policy.min_amount_kobo THEN
    RAISE EXCEPTION 'amount is below the minimum withdrawal limit' USING errcode = '22023';
  END IF;

  IF v_kobo > v_policy.max_amount_kobo THEN
    RAISE EXCEPTION 'amount exceeds the per-withdrawal limit' USING errcode = '22023';
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

  PERFORM public.assert_withdrawal_identity_allowed(p_user_id);

  PERFORM public.ensure_wallet_account(p_user_id);

  SELECT w.available_balance, w.currency
    INTO v_available, v_currency
  FROM public.wallets w
  WHERE w.user_id = p_user_id
  FOR UPDATE;

  IF v_available < v_kobo THEN
    RAISE EXCEPTION 'insufficient available balance' USING errcode = '55000';
  END IF;

  v_day := public.withdrawal_lagos_calendar_day(now());
  v_daily_spent := public.user_withdrawal_daily_reserved_kobo(p_user_id, v_day);

  IF v_daily_spent + v_kobo > v_policy.max_daily_amount_kobo THEN
    RAISE EXCEPTION 'daily withdrawal limit exceeded' USING errcode = '55000';
  END IF;

  v_initial_status := CASE
    WHEN v_policy.require_admin_review THEN 'pending'::public.wallet_withdrawal_status
    ELSE 'processing'::public.wallet_withdrawal_status
  END;

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
    wallet_transaction_id,
    processing_at
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
    v_initial_status,
    v_key,
    v_tx_id,
    CASE
      WHEN v_initial_status = 'processing'::public.wallet_withdrawal_status THEN now()
      ELSE NULL
    END
  )
  RETURNING id INTO v_withdrawal_id;

  PERFORM public.notify_wallet_withdrawal_user(v_withdrawal_id, 'submitted');

  IF v_initial_status = 'processing'::public.wallet_withdrawal_status THEN
    PERFORM public.notify_wallet_withdrawal_user(v_withdrawal_id, 'processing');
  END IF;

  RETURN v_withdrawal_id;
END;
$$;


REVOKE ALL ON FUNCTION public.request_wallet_withdrawal(uuid, numeric, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_wallet_withdrawal(uuid, numeric, uuid, text) TO service_role;
