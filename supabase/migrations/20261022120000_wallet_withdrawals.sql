-- Manual wallet withdrawals: durable queue rows, ledger-linked reservations, admin settlement RPCs.
-- admin_audit_entity_type value wallet_withdrawal is added in 20261022115900_admin_audit_wallet_withdrawal.sql

CREATE TYPE public.wallet_withdrawal_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'rejected',
  'failed'
);

COMMENT ON TYPE public.wallet_withdrawal_status IS
  'User withdrawal queue lifecycle. Funds leave available_balance at pending; terminal reject/fail credits back once via release_transaction_id.';

CREATE TABLE public.wallet_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  amount_kobo bigint NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  bank_account_id uuid REFERENCES public.user_bank_accounts (id) ON DELETE SET NULL,
  destination_bank_code text NOT NULL,
  destination_bank_name text NOT NULL,
  destination_account_number text NOT NULL,
  destination_account_name text NOT NULL,
  paystack_recipient_code text NOT NULL,
  status public.wallet_withdrawal_status NOT NULL DEFAULT 'pending'::public.wallet_withdrawal_status,
  user_facing_reason text,
  admin_notes text,
  idempotency_key text NOT NULL,
  wallet_transaction_id uuid NOT NULL UNIQUE REFERENCES public.wallet_transactions (id) ON DELETE RESTRICT,
  release_transaction_id uuid UNIQUE REFERENCES public.wallet_transactions (id) ON DELETE RESTRICT,
  bank_transfer_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  processing_at timestamptz,
  processing_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  rejected_at timestamptz,
  rejected_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  failed_at timestamptz,
  failed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT wallet_withdrawals_amount_check CHECK (amount_kobo > 0),
  CONSTRAINT wallet_withdrawals_currency_check CHECK (currency = 'NGN'),
  CONSTRAINT wallet_withdrawals_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT wallet_withdrawals_destination_bank_code_check CHECK (char_length(btrim(destination_bank_code)) > 0),
  CONSTRAINT wallet_withdrawals_destination_bank_name_check CHECK (char_length(btrim(destination_bank_name)) > 0),
  CONSTRAINT wallet_withdrawals_destination_account_number_check CHECK (
    destination_account_number ~ '^[0-9]{10}$'
  ),
  CONSTRAINT wallet_withdrawals_destination_account_name_check CHECK (
    char_length(btrim(destination_account_name)) > 0
  ),
  CONSTRAINT wallet_withdrawals_recipient_code_check CHECK (char_length(btrim(paystack_recipient_code)) > 0),
  CONSTRAINT wallet_withdrawals_user_facing_reason_check CHECK (
    user_facing_reason IS NULL OR char_length(btrim(user_facing_reason)) >= 3
  )
);

COMMENT ON TABLE public.wallet_withdrawals IS
  'Manual payout queue. Destination fields are an immutable snapshot at submission; bank_account_id is informational only.';

CREATE INDEX wallet_withdrawals_user_created_idx
  ON public.wallet_withdrawals (user_id, created_at DESC);

CREATE INDEX wallet_withdrawals_status_created_idx
  ON public.wallet_withdrawals (status, created_at DESC);

CREATE INDEX wallet_withdrawals_bank_account_active_idx
  ON public.wallet_withdrawals (bank_account_id)
  WHERE status IN (
    'pending'::public.wallet_withdrawal_status,
    'processing'::public.wallet_withdrawal_status
  );

CREATE OR REPLACE FUNCTION public.wallet_withdrawals_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER wallet_withdrawals_touch_updated_at
  BEFORE UPDATE ON public.wallet_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.wallet_withdrawals_touch_updated_at();

ALTER TABLE public.wallet_withdrawals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wallet_withdrawals FROM PUBLIC;
REVOKE ALL ON TABLE public.wallet_withdrawals FROM anon;
REVOKE ALL ON TABLE public.wallet_withdrawals FROM authenticated;
GRANT ALL ON TABLE public.wallet_withdrawals TO service_role;

CREATE OR REPLACE FUNCTION public.mask_bank_account_number(p_account_number text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO ''
AS $$
  SELECT '******' || right(p_account_number, 4);
$$;

REVOKE ALL ON FUNCTION public.mask_bank_account_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mask_bank_account_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mask_bank_account_number(text) TO service_role;

-- Backfill queue rows for legacy pending withdrawal ledger entries (pre-table).
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
  created_at,
  updated_at
)
SELECT
  wt.user_id,
  wt.amount,
  'NGN',
  CASE
    WHEN wt.metadata ? 'bank_account_id'
      AND (wt.metadata ->> 'bank_account_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (wt.metadata ->> 'bank_account_id')::uuid
    ELSE NULL
  END,
  coalesce(wt.metadata ->> 'bank_code', '000'),
  coalesce(wt.metadata ->> 'bank_name', 'Unknown bank'),
  coalesce(
    (
      SELECT a.account_number
      FROM public.user_bank_accounts a
      WHERE a.id = (wt.metadata ->> 'bank_account_id')::uuid
    ),
    '0000000000'
  ),
  coalesce(wt.metadata ->> 'account_name', 'Unknown'),
  coalesce(wt.metadata ->> 'paystack_recipient_code', 'legacy_unknown'),
  CASE wt.status
    WHEN 'completed'::public.wallet_transaction_status THEN 'completed'::public.wallet_withdrawal_status
    WHEN 'failed'::public.wallet_transaction_status THEN 'failed'::public.wallet_withdrawal_status
    WHEN 'reversed'::public.wallet_transaction_status THEN 'rejected'::public.wallet_withdrawal_status
    ELSE 'pending'::public.wallet_withdrawal_status
  END,
  CASE
    WHEN wt.reference LIKE 'withdraw:%' THEN substring(wt.reference FROM 10)
    ELSE 'legacy:' || wt.id::text
  END,
  wt.id,
  wt.created_at,
  wt.created_at
FROM public.wallet_transactions wt
WHERE wt.type = 'withdrawal'::public.wallet_transaction_type
ON CONFLICT (wallet_transaction_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.user_bank_account_pending_withdrawal_exists(
  p_user_id uuid,
  p_bank_account_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.wallet_withdrawals w
    WHERE w.user_id = p_user_id
      AND w.bank_account_id = p_bank_account_id
      AND w.status IN (
        'pending'::public.wallet_withdrawal_status,
        'processing'::public.wallet_withdrawal_status
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    WHERE wt.user_id = p_user_id
      AND wt.type = 'withdrawal'::public.wallet_transaction_type
      AND wt.status = 'pending'::public.wallet_transaction_status
      AND wt.metadata ->> 'bank_account_id' = p_bank_account_id::text
      AND NOT EXISTS (
        SELECT 1
        FROM public.wallet_withdrawals w2
        WHERE w2.wallet_transaction_id = wt.id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.wallet_withdrawal_release_reservation(
  p_withdrawal_id uuid,
  p_release_reference text,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_row public.wallet_withdrawals%rowtype;
  v_release_id uuid;
BEGIN
  IF p_release_reference IS NULL OR btrim(p_release_reference) = '' THEN
    RAISE EXCEPTION 'release reference is required' USING errcode = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.wallet_withdrawals w
  WHERE w.id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal not found' USING errcode = 'P0002';
  END IF;

  IF v_row.release_transaction_id IS NOT NULL THEN
    RETURN v_row.release_transaction_id;
  END IF;

  v_release_id := public.wallet_apply_entry(
    p_release_reference,
    v_row.user_id,
    NULL,
    'adjustment'::public.wallet_transaction_type,
    v_row.amount_kobo,
    0,
    coalesce(p_description, 'Withdrawal funds returned'),
    jsonb_build_object(
      'legacy_kind', 'withdrawal_release',
      'withdrawal_id', v_row.id,
      'reservation_transaction_id', v_row.wallet_transaction_id
    ),
    NULL,
    0,
    'completed'::public.wallet_transaction_status
  );

  UPDATE public.wallet_transactions wt
  SET status = 'failed'::public.wallet_transaction_status
  WHERE wt.id = v_row.wallet_transaction_id
    AND wt.status = 'pending'::public.wallet_transaction_status;

  UPDATE public.wallet_withdrawals w
  SET release_transaction_id = v_release_id
  WHERE w.id = v_row.id;

  RETURN v_release_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_withdrawal_release_reservation(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_withdrawal_release_reservation(uuid, text, text) TO service_role;

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

  PERFORM public.create_notification(
    p_user_id,
    'withdraw:' || v_key || ':processing',
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

  RETURN v_withdrawal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_wallet_withdrawal(uuid, numeric, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_wallet_withdrawal(uuid, numeric, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.list_my_wallet_withdrawals(
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  withdrawal_id uuid,
  amount_kobo bigint,
  currency text,
  status text,
  destination_bank_name text,
  destination_account_number_masked text,
  destination_account_name text,
  user_facing_reason text,
  wallet_transaction_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    w.id,
    w.amount_kobo,
    w.currency,
    w.status::text,
    w.destination_bank_name,
    public.mask_bank_account_number(w.destination_account_number),
    w.destination_account_name,
    w.user_facing_reason,
    w.wallet_transaction_id,
    w.created_at,
    w.updated_at,
    w.completed_at
  FROM public.wallet_withdrawals w
  WHERE w.user_id = public.assert_authenticated()
  ORDER BY w.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 25), 100))
  OFFSET greatest(0, coalesce(p_offset, 0));
$$;

GRANT EXECUTE ON FUNCTION public.list_my_wallet_withdrawals(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_wallet_withdrawals(integer, integer) TO service_role;

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
    'completed_at', v_row.completed_at,
    'rejected_at', v_row.rejected_at,
    'failed_at', v_row.failed_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_wallet_withdrawal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_wallet_withdrawal(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_get_wallet_withdrawal(p_withdrawal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_row public.wallet_withdrawals%rowtype;
  v_user_name text;
BEGIN
  PERFORM public.admin_require_permission('withdrawals');

  SELECT * INTO v_row
  FROM public.wallet_withdrawals w
  WHERE w.id = p_withdrawal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal not found' USING errcode = 'P0002';
  END IF;

  SELECT p.display_name INTO v_user_name
  FROM public.profiles p
  WHERE p.id = v_row.user_id;

  RETURN jsonb_build_object(
    'withdrawal', jsonb_build_object(
      'id', v_row.id,
      'user_id', v_row.user_id,
      'user_name', v_user_name,
      'amount_kobo', v_row.amount_kobo,
      'currency', v_row.currency,
      'status', v_row.status::text,
      'bank_account_id', v_row.bank_account_id,
      'destination_bank_code', v_row.destination_bank_code,
      'destination_bank_name', v_row.destination_bank_name,
      'destination_account_number', v_row.destination_account_number,
      'destination_account_name', v_row.destination_account_name,
      'paystack_recipient_code', v_row.paystack_recipient_code,
      'user_facing_reason', v_row.user_facing_reason,
      'admin_notes', v_row.admin_notes,
      'idempotency_key', v_row.idempotency_key,
      'wallet_transaction_id', v_row.wallet_transaction_id,
      'release_transaction_id', v_row.release_transaction_id,
      'bank_transfer_reference', v_row.bank_transfer_reference,
      'created_at', v_row.created_at,
      'updated_at', v_row.updated_at,
      'approved_at', v_row.approved_at,
      'approved_by', v_row.approved_by,
      'processing_at', v_row.processing_at,
      'processing_by', v_row.processing_by,
      'completed_at', v_row.completed_at,
      'completed_by', v_row.completed_by,
      'rejected_at', v_row.rejected_at,
      'rejected_by', v_row.rejected_by,
      'failed_at', v_row.failed_at,
      'failed_by', v_row.failed_by
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_wallet_withdrawal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_wallet_withdrawal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_wallet_withdrawal(uuid) TO service_role;

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

  PERFORM public.create_notification(
    v_row.user_id,
    'withdrawal:' || v_row.id::text || ':success',
    'withdrawal_successful'::public.notification_type,
    'Withdrawal successful',
    format(
      '%s %s has been sent to your bank account.',
      trim(to_char(public.kobo_to_ngn_major(v_row.amount_kobo), 'FM999999990.00')),
      v_row.currency
    ),
    '/wallet',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    v_row.wallet_transaction_id,
    false
  );

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

  PERFORM public.create_notification(
    v_row.user_id,
    'withdrawal:' || v_row.id::text || ':rejected',
    'withdrawal_failed'::public.notification_type,
    'Withdrawal not completed',
    v_reason,
    '/wallet',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    v_row.wallet_transaction_id,
    false
  );

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

  PERFORM public.create_notification(
    v_row.user_id,
    'withdrawal:' || v_row.id::text || ':failed',
    'withdrawal_failed'::public.notification_type,
    'Withdrawal not completed',
    v_reason,
    '/wallet',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    v_row.wallet_transaction_id,
    false
  );

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

CREATE OR REPLACE FUNCTION public.admin_list_withdrawals(
  p_query text DEFAULT '',
  p_status text DEFAULT 'all',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_total integer;
  v_items jsonb;
  v_status text := coalesce(btrim(p_status), 'all');
BEGIN
  PERFORM public.admin_require_permission('withdrawals');

  SELECT count(*)::int
  INTO v_total
  FROM public.wallet_withdrawals w
  INNER JOIN public.profiles p ON p.id = w.user_id
  WHERE (
    v_q = ''
    OR w.id::text ILIKE '%' || v_q || '%'
    OR w.idempotency_key ILIKE '%' || v_q || '%'
    OR coalesce(w.bank_transfer_reference, '') ILIKE '%' || v_q || '%'
    OR w.user_id::text ILIKE '%' || v_q || '%'
    OR coalesce(p.display_name, '') ILIKE '%' || v_q || '%'
    OR w.wallet_transaction_id::text ILIKE '%' || v_q || '%'
  )
  AND (
    v_status = 'all'
    OR w.status::text = v_status
  );

  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      w.wallet_transaction_id AS id,
      w.id AS withdrawal_id,
      w.user_id,
      p.display_name AS user_name,
      w.amount_kobo AS amount,
      w.status::text AS status,
      w.idempotency_key AS reference,
      w.bank_transfer_reference AS paystack_reference,
      w.destination_bank_name,
      public.mask_bank_account_number(w.destination_account_number) AS destination_account_number_masked,
      w.destination_account_name,
      w.wallet_transaction_id,
      w.release_transaction_id,
      w.created_at,
      w.processing_at,
      w.completed_at
    FROM public.wallet_withdrawals w
    INNER JOIN public.profiles p ON p.id = w.user_id
    WHERE (
      v_q = ''
      OR w.id::text ILIKE '%' || v_q || '%'
      OR w.idempotency_key ILIKE '%' || v_q || '%'
      OR coalesce(w.bank_transfer_reference, '') ILIKE '%' || v_q || '%'
      OR w.user_id::text ILIKE '%' || v_q || '%'
      OR coalesce(p.display_name, '') ILIKE '%' || v_q || '%'
      OR w.wallet_transaction_id::text ILIKE '%' || v_q || '%'
    )
    AND (
      v_status = 'all'
      OR w.status::text = v_status
    )
    ORDER BY w.created_at DESC
    LIMIT greatest(1, least(p_limit, 100))
    OFFSET greatest(0, p_offset)
  ) t;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', greatest(1, least(p_limit, 100)),
    'offset', greatest(0, p_offset),
    'items', v_items
  );
END;
$$;
