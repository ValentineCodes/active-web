-- Production wallet model: kobo integer balances, auditable transactions, Paystack-ready deposits, payment locks.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.wallet_transaction_type AS ENUM (
  'deposit',
  'manual_top_up',
  'withdrawal',
  'escrow_lock',
  'escrow_top_up',
  'escrow_partial_refund',
  'escrow_pending',
  'escrow_relock',
  'escrow_release',
  'payout',
  'refund',
  'service_fee',
  'adjustment'
);

CREATE TYPE public.wallet_transaction_status AS ENUM (
  'pending',
  'completed',
  'failed',
  'reversed'
);

CREATE TYPE public.deposit_transaction_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled'
);

CREATE TYPE public.payment_lock_bucket AS ENUM (
  'locked',
  'pending'
);

COMMENT ON TYPE public.wallet_transaction_type IS
  'Ledger entry classification. Deposits use deposit; Paystack-verified credits reference paystack_reference on the row.';

-- ---------------------------------------------------------------------------
-- Helpers (major NGN on request offers / legacy RPC args → kobo in wallets)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ngn_major_to_kobo(p_amount numeric)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO ''
AS $$
  SELECT (round(p_amount * 100))::bigint;
$$;

CREATE OR REPLACE FUNCTION public.kobo_to_ngn_major(p_kobo bigint)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path TO ''
AS $$
  SELECT (p_kobo / 100.0)::numeric(12, 2);
$$;

REVOKE ALL ON FUNCTION public.ngn_major_to_kobo(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ngn_major_to_kobo(numeric) TO service_role;

REVOKE ALL ON FUNCTION public.kobo_to_ngn_major(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kobo_to_ngn_major(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kobo_to_ngn_major(bigint) TO service_role;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'NGN',
  available_balance bigint NOT NULL DEFAULT 0,
  locked_balance bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallets_currency_check CHECK (currency = 'NGN'),
  CONSTRAINT wallets_available_balance_check CHECK (available_balance >= 0),
  CONSTRAINT wallets_locked_balance_check CHECK (locked_balance >= 0)
);

COMMENT ON TABLE public.wallets IS
  'Server-authoritative user wallet. All amounts are integer kobo (1 NGN = 100 kobo). locked_balance holds funds committed to requests (posted + in-service).';

CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.wallets (id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  type public.wallet_transaction_type NOT NULL,
  amount bigint NOT NULL,
  status public.wallet_transaction_status NOT NULL DEFAULT 'completed',
  reference text NOT NULL,
  request_id uuid REFERENCES public.requests (id) ON DELETE SET NULL,
  paystack_reference text,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_transactions_amount_check CHECK (amount >= 0),
  CONSTRAINT wallet_transactions_reference_key UNIQUE (reference),
  CONSTRAINT wallet_transactions_paystack_reference_key UNIQUE (paystack_reference)
);

COMMENT ON TABLE public.wallet_transactions IS
  'Append-only financial audit log. reference is the idempotency key; Paystack deposits also set paystack_reference (unique).';

CREATE TABLE public.deposit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.wallets (id) ON DELETE RESTRICT,
  amount bigint NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  reference text NOT NULL,
  paystack_reference text,
  status public.deposit_transaction_status NOT NULL DEFAULT 'pending',
  wallet_transaction_id uuid REFERENCES public.wallet_transactions (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT deposit_transactions_amount_check CHECK (amount > 0),
  CONSTRAINT deposit_transactions_currency_check CHECK (currency = 'NGN'),
  CONSTRAINT deposit_transactions_reference_key UNIQUE (reference),
  CONSTRAINT deposit_transactions_paystack_reference_key UNIQUE (paystack_reference)
);

COMMENT ON TABLE public.deposit_transactions IS
  'Paystack deposit lifecycle. A successful Paystack charge completes at most once (paystack_reference + wallet transaction reference).';

CREATE TABLE public.payment_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.wallets (id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE REFERENCES public.requests (id) ON DELETE RESTRICT,
  provider_amount bigint NOT NULL,
  service_fee bigint NOT NULL,
  total bigint NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  bucket public.payment_lock_bucket NOT NULL DEFAULT 'locked',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_locks_currency_check CHECK (currency = 'NGN'),
  CONSTRAINT payment_locks_provider_amount_check CHECK (provider_amount > 0),
  CONSTRAINT payment_locks_service_fee_check CHECK (service_fee >= 0),
  CONSTRAINT payment_locks_total_check CHECK (total = provider_amount + service_fee),
  CONSTRAINT payment_locks_total_positive_check CHECK (total > 0)
);

COMMENT ON TABLE public.payment_locks IS
  'Funds committed to a request (escrow). bucket distinguishes posted vs in-service holds; wallet locked_balance is the sum of active lock totals.';

CREATE INDEX wallet_transactions_wallet_created_idx
  ON public.wallet_transactions (wallet_id, created_at DESC);

CREATE INDEX wallet_transactions_user_created_idx
  ON public.wallet_transactions (user_id, created_at DESC);

CREATE INDEX wallet_transactions_request_idx
  ON public.wallet_transactions (request_id, created_at DESC)
  WHERE request_id IS NOT NULL;

CREATE INDEX deposit_transactions_user_created_idx
  ON public.deposit_transactions (user_id, created_at DESC);

CREATE INDEX deposit_transactions_status_idx
  ON public.deposit_transactions (status, created_at DESC);

CREATE INDEX payment_locks_user_idx
  ON public.payment_locks (user_id);

CREATE INDEX payment_locks_wallet_idx
  ON public.payment_locks (wallet_id);

-- ---------------------------------------------------------------------------
-- Migrate legacy wallet_accounts / wallet_ledger / request_escrow
-- ---------------------------------------------------------------------------

INSERT INTO public.wallets (user_id, currency, available_balance, locked_balance, created_at, updated_at)
SELECT
  wa.user_id,
  wa.currency,
  public.ngn_major_to_kobo(wa.available),
  public.ngn_major_to_kobo(wa.locked + wa.pending),
  wa.updated_at,
  wa.updated_at
FROM public.wallet_accounts wa;

INSERT INTO public.payment_locks (
  wallet_id,
  user_id,
  request_id,
  provider_amount,
  service_fee,
  total,
  currency,
  bucket,
  created_at,
  updated_at
)
SELECT
  w.id,
  re.requester_id,
  re.request_id,
  public.ngn_major_to_kobo(re.provider_amount),
  public.ngn_major_to_kobo(re.service_fee),
  public.ngn_major_to_kobo(re.total),
  re.currency,
  re.escrow_bucket::public.payment_lock_bucket,
  re.created_at,
  re.created_at
FROM public.request_escrow re
JOIN public.wallets w ON w.user_id = re.requester_id;

INSERT INTO public.wallet_transactions (
  id,
  wallet_id,
  user_id,
  type,
  amount,
  status,
  reference,
  request_id,
  paystack_reference,
  description,
  metadata,
  created_at
)
SELECT
  wl.id,
  w.id,
  wl.user_id,
  CASE wl.kind
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
  END,
  public.ngn_major_to_kobo(
    abs(coalesce(wl.available_delta, 0))
    + abs(coalesce(wl.locked_delta, 0))
    + abs(coalesce(wl.pending_delta, 0))
    + abs(coalesce(wl.platform_available_delta, 0))
  ),
  'completed'::public.wallet_transaction_status,
  wl.idempotency_key,
  wl.request_id,
  CASE
    WHEN wl.kind = 'external_deposit' THEN wl.external_reference
    ELSE NULL
  END,
  NULL,
  jsonb_build_object(
    'legacy_kind', wl.kind,
    'available_delta_kobo', public.ngn_major_to_kobo(coalesce(wl.available_delta, 0)),
    'locked_delta_kobo', public.ngn_major_to_kobo(coalesce(wl.locked_delta, 0)),
    'pending_delta_kobo', public.ngn_major_to_kobo(coalesce(wl.pending_delta, 0)),
    'platform_delta_kobo', public.ngn_major_to_kobo(coalesce(wl.platform_available_delta, 0))
  ),
  wl.created_at
FROM public.wallet_ledger wl
LEFT JOIN public.wallets w ON w.user_id = wl.user_id
WHERE wl.user_id IS NOT NULL AND w.id IS NOT NULL;

-- Platform wallet → kobo
ALTER TABLE public.platform_wallet
  ALTER COLUMN available TYPE bigint USING public.ngn_major_to_kobo(available);

-- ---------------------------------------------------------------------------
-- Retarget notification inbox FK (preserve ledger row ids on wallet_transactions)
-- ---------------------------------------------------------------------------

ALTER TABLE public.notification_inbox
  DROP CONSTRAINT IF EXISTS notification_inbox_wallet_ledger_id_fkey;

ALTER TABLE public.notification_inbox
  ADD CONSTRAINT notification_inbox_wallet_ledger_id_fkey
  FOREIGN KEY (wallet_ledger_id) REFERENCES public.wallet_transactions (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Drop legacy tables; keep compatibility views for reads/tests
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.my_wallet_activity;
DROP VIEW IF EXISTS public.my_wallet;

DROP TABLE public.wallet_ledger;
DROP TABLE public.wallet_accounts;
DROP TABLE public.request_escrow;

CREATE VIEW public.request_escrow
WITH (security_invoker = on) AS
SELECT
  pl.request_id,
  pl.user_id AS requester_id,
  public.kobo_to_ngn_major(pl.provider_amount) AS provider_amount,
  public.kobo_to_ngn_major(pl.service_fee) AS service_fee,
  public.kobo_to_ngn_major(pl.total) AS total,
  pl.currency,
  pl.bucket::text AS escrow_bucket,
  pl.created_at
FROM public.payment_locks pl;

CREATE VIEW public.my_wallet
WITH (security_invoker = on) AS
SELECT
  w.user_id,
  public.kobo_to_ngn_major(w.available_balance) AS available,
  coalesce(
    (
      SELECT public.kobo_to_ngn_major(sum(pl.total)::bigint)
      FROM public.payment_locks pl
      JOIN public.requests r ON r.id = pl.request_id
      WHERE pl.user_id = w.user_id
        AND pl.bucket = 'locked'::public.payment_lock_bucket
        AND r.payment_status = 'locked'::public.payment_status
    ),
    0::numeric(12, 2)
  ) AS locked,
  coalesce(
    (
      SELECT public.kobo_to_ngn_major(sum(pl.total)::bigint)
      FROM public.payment_locks pl
      JOIN public.requests r ON r.id = pl.request_id
      WHERE pl.user_id = w.user_id
        AND pl.bucket = 'pending'::public.payment_lock_bucket
        AND r.payment_status = 'pending'::public.payment_status
    ),
    0::numeric(12, 2)
  ) AS pending,
  w.currency,
  w.updated_at
FROM public.wallets w
WHERE w.user_id = auth.uid();

CREATE VIEW public.my_wallet_activity
WITH (security_invoker = on) AS
SELECT
  wt.id,
  coalesce(wt.metadata ->> 'legacy_kind', wt.type::text) AS kind,
  public.kobo_to_ngn_major(coalesce((wt.metadata ->> 'available_delta_kobo')::bigint, 0)) AS available_delta,
  public.kobo_to_ngn_major(coalesce((wt.metadata ->> 'locked_delta_kobo')::bigint, 0)) AS locked_delta,
  public.kobo_to_ngn_major(coalesce((wt.metadata ->> 'pending_delta_kobo')::bigint, 0)) AS pending_delta,
  wt.request_id,
  wt.created_at
FROM public.wallet_transactions wt
WHERE wt.user_id = auth.uid();

CREATE VIEW public.wallet_ledger
WITH (security_invoker = on) AS
SELECT
  wt.id,
  wt.reference AS idempotency_key,
  wt.user_id,
  wt.request_id,
  coalesce(wt.metadata ->> 'legacy_kind', wt.type::text) AS kind,
  public.kobo_to_ngn_major(coalesce((wt.metadata ->> 'available_delta_kobo')::bigint, 0)) AS available_delta,
  public.kobo_to_ngn_major(coalesce((wt.metadata ->> 'locked_delta_kobo')::bigint, 0)) AS locked_delta,
  public.kobo_to_ngn_major(coalesce((wt.metadata ->> 'pending_delta_kobo')::bigint, 0)) AS pending_delta,
  public.kobo_to_ngn_major(coalesce((wt.metadata ->> 'platform_delta_kobo')::bigint, 0)) AS platform_available_delta,
  wt.paystack_reference AS external_reference,
  wt.created_at
FROM public.wallet_transactions wt;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wallets_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER wallets_touch_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.wallets_touch_updated_at();

CREATE OR REPLACE FUNCTION public.payment_locks_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_locks_touch_updated_at
  BEFORE UPDATE ON public.payment_locks
  FOR EACH ROW
  EXECUTE FUNCTION public.payment_locks_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallets_select_own
  ON public.wallets
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY wallet_transactions_select_own
  ON public.wallet_transactions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY deposit_transactions_select_own
  ON public.deposit_transactions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY payment_locks_select_own
  ON public.payment_locks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants (reads only for clients; writes via SECURITY DEFINER RPCs)
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.wallets TO authenticated;
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT SELECT ON public.deposit_transactions TO authenticated;
GRANT SELECT ON public.payment_locks TO authenticated;

GRANT ALL ON public.wallets TO service_role;
GRANT ALL ON public.wallet_transactions TO service_role;
GRANT ALL ON public.deposit_transactions TO service_role;
GRANT ALL ON public.payment_locks TO service_role;

GRANT SELECT ON public.request_escrow TO authenticated;
GRANT SELECT ON public.request_escrow TO service_role;

REVOKE ALL ON public.wallets FROM PUBLIC;
REVOKE ALL ON public.wallet_transactions FROM PUBLIC;
REVOKE ALL ON public.deposit_transactions FROM PUBLIC;
REVOKE ALL ON public.payment_locks FROM PUBLIC;
