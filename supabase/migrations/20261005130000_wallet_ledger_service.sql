-- Server-authoritative wallet ledger: atomic kobo entries and explicit operations.

CREATE TYPE public.payment_lock_status AS ENUM (
  'active',
  'released',
  'refunded'
);

ALTER TABLE public.payment_locks
  ADD COLUMN IF NOT EXISTS status public.payment_lock_status NOT NULL DEFAULT 'active';

COMMENT ON COLUMN public.payment_locks.status IS
  'Terminal states released/refunded prevent double settlement of the same lock.';

CREATE INDEX payment_locks_request_active_idx
  ON public.payment_locks (request_id)
  WHERE status = 'active'::public.payment_lock_status;

-- ---------------------------------------------------------------------------
-- Atomic ledger entry (single idempotency key → at most one balance effect)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wallet_apply_entry(
  p_reference text,
  p_user_id uuid,
  p_request_id uuid,
  p_type public.wallet_transaction_type,
  p_available_delta_kobo bigint,
  p_locked_delta_kobo bigint,
  p_description text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_paystack_reference text DEFAULT NULL,
  p_platform_delta_kobo bigint DEFAULT 0,
  p_status public.wallet_transaction_status DEFAULT 'completed'::public.wallet_transaction_status
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_existing_id uuid;
  v_wallet public.wallets%rowtype;
  v_amount bigint;
  v_meta jsonb;
BEGIN
  IF p_reference IS NULL OR btrim(p_reference) = '' THEN
    RAISE EXCEPTION 'reference is required' USING errcode = '22023';
  END IF;

  SELECT wt.id INTO v_existing_id
  FROM public.wallet_transactions wt
  WHERE wt.reference = p_reference;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  IF p_user_id IS NOT NULL THEN
    PERFORM public.ensure_wallet_account(p_user_id);

    SELECT * INTO v_wallet
    FROM public.wallets w
    WHERE w.user_id = p_user_id
    FOR UPDATE;

    IF p_available_delta_kobo <> 0 OR p_locked_delta_kobo <> 0 THEN
      UPDATE public.wallets
      SET
        available_balance = available_balance + p_available_delta_kobo,
        locked_balance = locked_balance + p_locked_delta_kobo
      WHERE user_id = p_user_id;

      SELECT * INTO v_wallet
      FROM public.wallets w
      WHERE w.user_id = p_user_id;

      IF v_wallet.available_balance < 0 OR v_wallet.locked_balance < 0 THEN
        RAISE EXCEPTION 'wallet balance cannot go negative' USING errcode = '55000';
      END IF;
    END IF;
  END IF;

  IF p_platform_delta_kobo <> 0 THEN
    UPDATE public.platform_wallet
    SET available = available + p_platform_delta_kobo, updated_at = now()
    WHERE id = 1;

    IF (SELECT available FROM public.platform_wallet WHERE id = 1) < 0 THEN
      RAISE EXCEPTION 'platform wallet cannot go negative' USING errcode = '55000';
    END IF;
  END IF;

  v_meta := coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'available_delta_kobo', coalesce(p_available_delta_kobo, 0),
      'locked_delta_kobo', coalesce(p_locked_delta_kobo, 0),
      'pending_delta_kobo', 0,
      'platform_delta_kobo', coalesce(p_platform_delta_kobo, 0)
    );

  v_amount := abs(coalesce(p_available_delta_kobo, 0))
    + abs(coalesce(p_locked_delta_kobo, 0));
  IF v_amount = 0 AND p_platform_delta_kobo <> 0 THEN
    v_amount := abs(p_platform_delta_kobo);
  END IF;

  IF p_user_id IS NULL AND p_platform_delta_kobo <> 0 AND p_request_id IS NOT NULL THEN
    SELECT r.requester_id INTO p_user_id
    FROM public.requests r
    WHERE r.id = p_request_id;
  END IF;

  IF p_user_id IS NOT NULL THEN
    IF v_wallet.id IS NULL THEN
      SELECT * INTO v_wallet FROM public.wallets w WHERE w.user_id = p_user_id;
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
      description,
      metadata
    )
    VALUES (
      v_wallet.id,
      p_user_id,
      p_type,
      v_amount,
      p_status,
      p_reference,
      p_request_id,
      p_paystack_reference,
      p_description,
      v_meta
    )
    RETURNING id INTO v_existing_id;

    RETURN v_existing_id;
  END IF;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Ledger operations (service_role / domain RPCs — not for direct client use)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wallet_credit_kobo(
  p_reference text,
  p_user_id uuid,
  p_amount_kobo bigint,
  p_type public.wallet_transaction_type,
  p_description text DEFAULT NULL,
  p_paystack_reference text DEFAULT NULL,
  p_request_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 THEN
    RAISE EXCEPTION 'credit amount must be positive' USING errcode = '22023';
  END IF;

  RETURN public.wallet_apply_entry(
    p_reference,
    p_user_id,
    p_request_id,
    p_type,
    p_amount_kobo,
    0,
    p_description,
    p_metadata,
    p_paystack_reference
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_debit_available_kobo(
  p_reference text,
  p_user_id uuid,
  p_amount_kobo bigint,
  p_type public.wallet_transaction_type,
  p_description text DEFAULT NULL,
  p_request_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_available bigint;
BEGIN
  IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 THEN
    RAISE EXCEPTION 'debit amount must be positive' USING errcode = '22023';
  END IF;

  PERFORM public.ensure_wallet_account(p_user_id);

  SELECT w.available_balance INTO v_available
  FROM public.wallets w
  WHERE w.user_id = p_user_id
  FOR UPDATE;

  IF v_available < p_amount_kobo THEN
    RAISE EXCEPTION 'insufficient available balance' USING errcode = '55000';
  END IF;

  RETURN public.wallet_apply_entry(
    p_reference,
    p_user_id,
    p_request_id,
    p_type,
    -p_amount_kobo,
    0,
    p_description,
    p_metadata
  );
END;
$$;

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

  PERFORM public.ensure_wallet_account(p_user_id);

  SELECT w.id, w.available_balance
    INTO v_wallet_id, v_available
  FROM public.wallets w
  WHERE w.user_id = p_user_id
  FOR UPDATE;

  IF v_available < p_total_kobo THEN
    RAISE EXCEPTION 'insufficient wallet balance to lock funds' USING errcode = '55000';
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
  )
  ON CONFLICT (request_id) DO NOTHING;

  RETURN public.wallet_apply_entry(
    p_reference,
    p_user_id,
    p_request_id,
    'escrow_lock'::public.wallet_transaction_type,
    -p_total_kobo,
    p_total_kobo,
    'Funds locked for request',
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

  IF v_lock.provider_amount = p_new_provider_amount_kobo THEN
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
    SELECT wt.id FROM public.wallet_transactions wt WHERE wt.reference = p_reference LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_shift_lock_bucket(
  p_reference text,
  p_request_id uuid,
  p_to_bucket public.payment_lock_bucket
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_lock public.payment_locks%rowtype;
  v_kind text;
  v_type public.wallet_transaction_type;
BEGIN
  SELECT * INTO v_lock
  FROM public.payment_locks pl
  WHERE pl.request_id = p_request_id
    AND pl.status = 'active'::public.payment_lock_status
  FOR UPDATE;

  IF v_lock.request_id IS NULL OR v_lock.bucket IS NOT DISTINCT FROM p_to_bucket THEN
    RETURN NULL;
  END IF;

  IF p_to_bucket = 'pending'::public.payment_lock_bucket THEN
    v_kind := 'escrow_pending';
    v_type := 'escrow_pending'::public.wallet_transaction_type;
  ELSE
    v_kind := 'escrow_relock';
    v_type := 'escrow_relock'::public.wallet_transaction_type;
  END IF;

  UPDATE public.payment_locks
  SET bucket = p_to_bucket
  WHERE request_id = p_request_id;

  RETURN public.wallet_apply_entry(
    p_reference,
    v_lock.user_id,
    p_request_id,
    v_type,
    0,
    0,
    'Escrow bucket updated',
    jsonb_build_object(
      'legacy_kind', v_kind,
      'bucket', p_to_bucket::text
    )
  );
END;
$$;

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
BEGIN
  IF p_recipient_user_id IS NULL THEN
    RAISE EXCEPTION 'recipient is required' USING errcode = '22023';
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
    p_reference || ':escrow_release',
    v_lock.user_id,
    p_request_id,
    'escrow_release'::public.wallet_transaction_type,
    0,
    -v_lock.total,
    'Escrow released',
    jsonb_build_object('legacy_kind', 'escrow_release')
  );

  PERFORM public.wallet_credit_kobo(
    p_reference || ':payout',
    p_recipient_user_id,
    v_lock.provider_amount,
    'payout'::public.wallet_transaction_type,
    'Payment for completed request',
    NULL,
    p_request_id,
    jsonb_build_object('legacy_kind', 'pay_provider')
  );

  PERFORM public.wallet_apply_entry(
    p_reference || ':service_fee',
    v_lock.user_id,
    p_request_id,
    'service_fee'::public.wallet_transaction_type,
    0,
    0,
    'Platform service fee',
    jsonb_build_object('legacy_kind', 'service_fee'),
    NULL,
    v_lock.service_fee
  );

  UPDATE public.payment_locks
  SET status = 'released'::public.payment_lock_status
  WHERE request_id = p_request_id;
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
BEGIN
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
    p_reference || ':refund',
    v_lock.user_id,
    p_request_id,
    'refund'::public.wallet_transaction_type,
    v_lock.total,
    -v_lock.total,
    'Funds returned to wallet',
    jsonb_build_object('legacy_kind', 'refund')
  );

  UPDATE public.payment_locks
  SET status = 'refunded'::public.payment_lock_status
  WHERE request_id = p_request_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Client-safe reads
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_wallet()
RETURNS TABLE (
  wallet_id uuid,
  available_kobo bigint,
  locked_kobo bigint,
  pending_kobo bigint,
  currency text,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  PERFORM public.ensure_wallet_account(v_user_id);

  RETURN QUERY
  SELECT
    w.id,
    w.available_balance,
    coalesce(
      (
        SELECT sum(pl.total)::bigint
        FROM public.payment_locks pl
        JOIN public.requests r ON r.id = pl.request_id
        WHERE pl.user_id = v_user_id
          AND pl.bucket = 'locked'::public.payment_lock_bucket
          AND pl.status = 'active'::public.payment_lock_status
          AND r.payment_status = 'locked'::public.payment_status
      ),
      0::bigint
    ),
    coalesce(
      (
        SELECT sum(pl.total)::bigint
        FROM public.payment_locks pl
        JOIN public.requests r ON r.id = pl.request_id
        WHERE pl.user_id = v_user_id
          AND pl.bucket = 'pending'::public.payment_lock_bucket
          AND pl.status = 'active'::public.payment_lock_status
          AND r.payment_status = 'pending'::public.payment_status
      ),
      0::bigint
    ),
    w.currency,
    w.updated_at
  FROM public.wallets w
  WHERE w.user_id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_wallet_transactions(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  type public.wallet_transaction_type,
  status public.wallet_transaction_status,
  amount bigint,
  reference text,
  request_id uuid,
  paystack_reference text,
  description text,
  metadata jsonb,
  available_delta_kobo bigint,
  locked_delta_kobo bigint,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'limit must be between 1 and 200' USING errcode = '22023';
  END IF;

  RETURN QUERY
  SELECT
    wt.id,
    wt.type,
    wt.status,
    wt.amount,
    wt.reference,
    wt.request_id,
    wt.paystack_reference,
    wt.description,
    wt.metadata,
    coalesce((wt.metadata ->> 'available_delta_kobo')::bigint, 0),
    coalesce((wt.metadata ->> 'locked_delta_kobo')::bigint, 0),
    wt.created_at
  FROM public.wallet_transactions wt
  WHERE wt.user_id = v_user_id
  ORDER BY wt.created_at DESC
  LIMIT p_limit;
END;
$$;

-- ---------------------------------------------------------------------------
-- Rewire legacy/domain entry points through the ledger service
-- ---------------------------------------------------------------------------

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
  v_avail_kobo bigint;
  v_locked_kobo bigint;
  v_pending_kobo bigint;
  v_held_kobo bigint;
  v_platform_kobo bigint;
  v_meta jsonb;
BEGIN
  v_avail_kobo := public.ngn_major_to_kobo(coalesce(p_available_delta, 0));
  v_locked_kobo := public.ngn_major_to_kobo(coalesce(p_locked_delta, 0));
  v_pending_kobo := public.ngn_major_to_kobo(coalesce(p_pending_delta, 0));
  v_held_kobo := v_locked_kobo + v_pending_kobo;
  v_platform_kobo := public.ngn_major_to_kobo(coalesce(p_platform_available_delta, 0));

  v_meta := jsonb_build_object(
    'legacy_kind', p_kind,
    'pending_delta_kobo', v_pending_kobo
  );

  PERFORM public.wallet_apply_entry(
    p_idempotency_key,
    p_user_id,
    p_request_id,
    public.map_wallet_kind_to_type(p_kind),
    v_avail_kobo,
    v_held_kobo,
    NULL,
    v_meta,
    CASE WHEN p_kind = 'external_deposit' THEN p_external_reference ELSE NULL END,
    v_platform_kobo
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

  PERFORM public.wallet_lock_funds_kobo(
    p_idempotency_key || ':escrow_lock',
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
  v_new_charge record;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  IF p_agreed_provider_amount IS NULL OR p_agreed_provider_amount <= 0 THEN
    RAISE EXCEPTION 'agreed amount must be positive' USING errcode = '22023';
  END IF;

  SELECT * INTO v_new_charge FROM public.compute_request_charge(p_agreed_provider_amount);

  PERFORM public.wallet_adjust_active_lock_kobo(
    p_idempotency_key || ':align',
    p_request_id,
    public.ngn_major_to_kobo(v_new_charge.provider_amount),
    public.ngn_major_to_kobo(v_new_charge.service_fee),
    public.ngn_major_to_kobo(v_new_charge.total)
  );
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
  v_selected_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.payment_locks pl WHERE pl.request_id = p_request_id) THEN
    RETURN;
  END IF;

  SELECT r.selected_user_id INTO v_selected_user_id
  FROM public.requests r
  WHERE r.id = p_request_id;

  IF p_from = 'locked' AND p_to = 'pending' THEN
    PERFORM public.wallet_shift_lock_bucket(
      p_idempotency_key || ':escrow_pending',
      p_request_id,
      'pending'::public.payment_lock_bucket
    );
  ELSIF p_from = 'pending' AND p_to = 'released' THEN
    PERFORM public.wallet_release_lock_kobo(
      p_idempotency_key,
      p_request_id,
      v_selected_user_id
    );
  ELSIF p_from = 'locked' AND p_to = 'refunded' THEN
    PERFORM public.wallet_refund_lock_kobo(p_idempotency_key, p_request_id);
  ELSIF p_from = 'pending' AND p_to = 'refunded' THEN
    PERFORM public.wallet_refund_lock_kobo(p_idempotency_key, p_request_id);
  ELSIF p_from = 'disputed' AND p_to = 'released' THEN
    PERFORM public.wallet_release_lock_kobo(
      p_idempotency_key,
      p_request_id,
      v_selected_user_id
    );
  ELSIF p_from = 'disputed' AND p_to = 'refunded' THEN
    PERFORM public.wallet_refund_lock_kobo(p_idempotency_key, p_request_id);
  ELSIF p_from = 'disputed' AND p_to = 'pending' THEN
    PERFORM public.wallet_shift_lock_bucket(
      p_idempotency_key || ':escrow_pending',
      p_request_id,
      'pending'::public.payment_lock_bucket
    );
  ELSIF p_from = 'disputed' AND p_to = 'locked' THEN
    PERFORM public.wallet_shift_lock_bucket(
      p_idempotency_key || ':escrow_relock',
      p_request_id,
      'locked'::public.payment_lock_bucket
    );
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
  v_tx_id uuid;
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

  SELECT w.id INTO v_wallet_id FROM public.wallets w WHERE w.user_id = p_user_id;

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
  ON CONFLICT (reference) DO NOTHING;

  v_tx_id := public.wallet_credit_kobo(
    p_idempotency_key,
    p_user_id,
    p_amount_kobo,
    'deposit'::public.wallet_transaction_type,
    'Wallet deposit',
    p_paystack_reference,
    NULL,
    jsonb_build_object('legacy_kind', 'external_deposit')
  );

  UPDATE public.deposit_transactions dt
  SET
    status = 'completed'::public.deposit_transaction_status,
    completed_at = now(),
    wallet_transaction_id = v_tx_id
  WHERE dt.reference = p_idempotency_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_top_up(p_amount numeric, p_idempotency_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_kobo bigint;
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

  v_kobo := public.ngn_major_to_kobo(p_amount);

  PERFORM public.wallet_credit_kobo(
    'manual_top_up:' || p_idempotency_key,
    v_user_id,
    v_kobo,
    'manual_top_up'::public.wallet_transaction_type,
    'Manual top-up',
    NULL,
    NULL,
    jsonb_build_object('legacy_kind', 'manual_top_up')
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
  v_kobo bigint;
  v_currency text;
  v_tx_id uuid;
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

  v_kobo := public.ngn_major_to_kobo(p_amount);

  SELECT w.currency INTO v_currency FROM public.wallets w WHERE w.user_id = v_user_id;

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

  v_tx_id := public.wallet_debit_available_kobo(
    'manual_withdraw:' || p_idempotency_key,
    v_user_id,
    v_kobo,
    'withdrawal'::public.wallet_transaction_type,
    'Withdrawal',
    NULL,
    jsonb_build_object('legacy_kind', 'manual_withdraw')
  );

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
    v_tx_id,
    false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.wallet_apply_entry(
  text, uuid, uuid, public.wallet_transaction_type, bigint, bigint, text, jsonb, text, bigint, public.wallet_transaction_status
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_apply_entry(
  text, uuid, uuid, public.wallet_transaction_type, bigint, bigint, text, jsonb, text, bigint, public.wallet_transaction_status
) TO service_role;

REVOKE ALL ON FUNCTION public.wallet_credit_kobo(
  text, uuid, bigint, public.wallet_transaction_type, text, text, uuid, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_credit_kobo(
  text, uuid, bigint, public.wallet_transaction_type, text, text, uuid, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.wallet_debit_available_kobo(
  text, uuid, bigint, public.wallet_transaction_type, text, uuid, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_debit_available_kobo(
  text, uuid, bigint, public.wallet_transaction_type, text, uuid, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.wallet_lock_funds_kobo(
  text, uuid, uuid, bigint, bigint, bigint, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_lock_funds_kobo(
  text, uuid, uuid, bigint, bigint, bigint, text
) TO service_role;

REVOKE ALL ON FUNCTION public.wallet_adjust_active_lock_kobo(
  text, uuid, bigint, bigint, bigint
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_adjust_active_lock_kobo(
  text, uuid, bigint, bigint, bigint
) TO service_role;

REVOKE ALL ON FUNCTION public.wallet_shift_lock_bucket(text, uuid, public.payment_lock_bucket) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_shift_lock_bucket(text, uuid, public.payment_lock_bucket) TO service_role;

REVOKE ALL ON FUNCTION public.wallet_release_lock_kobo(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_release_lock_kobo(text, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.wallet_refund_lock_kobo(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_refund_lock_kobo(text, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_my_wallet() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_wallet() TO service_role;

GRANT EXECUTE ON FUNCTION public.list_my_wallet_transactions(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_wallet_transactions(integer) TO service_role;
