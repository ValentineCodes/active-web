-- Optional milestone payments: schema, ledger partial release, RPCs (single-payment default unchanged).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

CREATE TYPE public.payment_structure AS ENUM ('single', 'milestone');

CREATE TYPE public.milestone_status AS ENUM (
  'pending',
  'in_progress',
  'submitted',
  'revision_requested',
  'approved_paid'
);

CREATE TYPE public.milestone_proposal_status AS ENUM (
  'draft',
  'proposed',
  'requester_agreed',
  'locked',
  'superseded'
);

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS payment_structure public.payment_structure NOT NULL DEFAULT 'single';

COMMENT ON COLUMN public.requests.payment_structure IS
  'single = lump-sum completion payout; milestone = progressive escrow release per engagement_milestones.';

-- ---------------------------------------------------------------------------
-- Milestone proposals (pre-accept negotiation)
-- ---------------------------------------------------------------------------

CREATE TABLE public.request_milestone_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests (id) ON DELETE RESTRICT,
  response_id uuid REFERENCES public.request_responses (id) ON DELETE CASCADE,
  status public.milestone_proposal_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_milestone_proposals_response_xor_draft CHECK (
    (response_id IS NULL AND status IN ('draft', 'locked', 'superseded'))
    OR (response_id IS NOT NULL AND status IN ('proposed', 'requester_agreed', 'locked', 'superseded'))
  )
);

CREATE UNIQUE INDEX request_milestone_proposals_request_draft_idx
  ON public.request_milestone_proposals (request_id)
  WHERE response_id IS NULL AND status = 'draft'::public.milestone_proposal_status;

CREATE UNIQUE INDEX request_milestone_proposals_response_active_idx
  ON public.request_milestone_proposals (response_id)
  WHERE response_id IS NOT NULL
    AND status IN (
      'proposed'::public.milestone_proposal_status,
      'requester_agreed'::public.milestone_proposal_status
    );

CREATE INDEX request_milestone_proposals_request_idx
  ON public.request_milestone_proposals (request_id, created_at DESC);

CREATE TABLE public.request_milestone_proposal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.request_milestone_proposals (id) ON DELETE CASCADE,
  position integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount_major numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_milestone_proposal_items_position_check CHECK (position >= 1 AND position <= 5),
  CONSTRAINT request_milestone_proposal_items_title_check CHECK (
    char_length(btrim(title)) >= 1 AND char_length(btrim(title)) <= 120
  ),
  CONSTRAINT request_milestone_proposal_items_description_check CHECK (
    char_length(btrim(description)) <= 1000
  ),
  CONSTRAINT request_milestone_proposal_items_amount_check CHECK (amount_major > 0),
  CONSTRAINT request_milestone_proposal_items_proposal_position_key UNIQUE (proposal_id, position)
);

-- ---------------------------------------------------------------------------
-- Engagement milestones (frozen at accept)
-- ---------------------------------------------------------------------------

CREATE TABLE public.engagement_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests (id) ON DELETE RESTRICT,
  proposal_id uuid NOT NULL REFERENCES public.request_milestone_proposals (id) ON DELETE RESTRICT,
  position integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount_major numeric(12, 2) NOT NULL,
  total_kobo bigint NOT NULL,
  provider_kobo bigint NOT NULL,
  fee_kobo bigint NOT NULL,
  status public.milestone_status NOT NULL DEFAULT 'pending',
  submitted_at timestamptz,
  submitted_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  revision_requested_at timestamptz,
  revision_requested_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  payout_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engagement_milestones_position_check CHECK (position >= 1 AND position <= 5),
  CONSTRAINT engagement_milestones_amount_check CHECK (amount_major > 0),
  CONSTRAINT engagement_milestones_kobo_check CHECK (
    total_kobo > 0
    AND provider_kobo >= 0
    AND fee_kobo >= 0
    AND total_kobo = provider_kobo + fee_kobo
  ),
  CONSTRAINT engagement_milestones_request_position_key UNIQUE (request_id, position),
  CONSTRAINT engagement_milestones_payout_reference_key UNIQUE (payout_reference)
);

CREATE INDEX engagement_milestones_request_idx
  ON public.engagement_milestones (request_id, position);

-- ---------------------------------------------------------------------------
-- Partial escrow release tracking on payment_locks
-- ---------------------------------------------------------------------------

ALTER TABLE public.payment_locks
  ADD COLUMN IF NOT EXISTS released_total_kobo bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS released_provider_kobo bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS released_fee_kobo bigint NOT NULL DEFAULT 0;

ALTER TABLE public.payment_locks
  ADD CONSTRAINT payment_locks_released_total_check CHECK (
    released_total_kobo >= 0
    AND released_provider_kobo >= 0
    AND released_fee_kobo >= 0
    AND released_total_kobo <= total
    AND released_provider_kobo <= provider_amount
    AND released_fee_kobo <= service_fee
    AND released_total_kobo = released_provider_kobo + released_fee_kobo
  );

COMMENT ON COLUMN public.payment_locks.released_total_kobo IS
  'Cumulative escrow released via milestone payouts; full release when released_total_kobo = total.';

-- ---------------------------------------------------------------------------
-- Timestamps
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.milestone_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER request_milestone_proposals_touch_updated_at
  BEFORE UPDATE ON public.request_milestone_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.milestone_touch_updated_at();

CREATE TRIGGER request_milestone_proposal_items_touch_updated_at
  BEFORE UPDATE ON public.request_milestone_proposal_items
  FOR EACH ROW
  EXECUTE FUNCTION public.milestone_touch_updated_at();

CREATE TRIGGER engagement_milestones_touch_updated_at
  BEFORE UPDATE ON public.engagement_milestones
  FOR EACH ROW
  EXECUTE FUNCTION public.milestone_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Validation helpers (integer money via kobo)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.parse_milestone_items_json(p_items jsonb)
RETURNS TABLE (
  milestone_position integer,
  title text,
  description text,
  amount_major numeric
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_elem jsonb;
  v_len integer;
  v_i integer;
  v_title text;
  v_description text;
  v_amount numeric;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'milestones must be a JSON array' USING errcode = '22023';
  END IF;

  v_len := jsonb_array_length(p_items);
  IF v_len < 2 OR v_len > 5 THEN
    RAISE EXCEPTION 'milestones must contain between 2 and 5 items' USING errcode = '22023';
  END IF;

  FOR v_i IN 0..(v_len - 1) LOOP
    v_elem := p_items -> v_i;
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION 'milestone item % must be an object', v_i + 1 USING errcode = '22023';
    END IF;

    v_title := btrim(coalesce(v_elem ->> 'title', ''));
    IF char_length(v_title) < 1 OR char_length(v_title) > 120 THEN
      RAISE EXCEPTION 'milestone % title must be between 1 and 120 characters', v_i + 1 USING errcode = '22023';
    END IF;

    v_description := btrim(coalesce(v_elem ->> 'description', ''));
    IF char_length(v_description) > 1000 THEN
      RAISE EXCEPTION 'milestone % description is too long', v_i + 1 USING errcode = '22023';
    END IF;

    v_amount := (v_elem ->> 'amount')::numeric;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'milestone % amount must be positive', v_i + 1 USING errcode = '22023';
    END IF;

    milestone_position := v_i + 1;
    title := v_title;
    description := v_description;
    amount_major := v_amount;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.milestone_items_sum_matches_total(
  p_items jsonb,
  p_total_major numeric
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_sum_major numeric := 0;
  v_sum_kobo bigint := 0;
  v_total_kobo bigint;
  v_row record;
BEGIN
  IF p_total_major IS NULL OR p_total_major <= 0 THEN
    RETURN false;
  END IF;

  FOR v_row IN SELECT * FROM public.parse_milestone_items_json(p_items) LOOP
    v_sum_major := v_sum_major + v_row.amount_major;
  END LOOP;

  IF v_sum_major <> p_total_major THEN
    RETURN false;
  END IF;

  v_total_kobo := public.ngn_major_to_kobo(p_total_major);
  FOR v_row IN SELECT * FROM public.parse_milestone_items_json(p_items) LOOP
    v_sum_kobo := v_sum_kobo + public.ngn_major_to_kobo(v_row.amount_major);
  END LOOP;

  RETURN v_sum_kobo = v_total_kobo;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_milestone_proposal_items(
  p_proposal_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  DELETE FROM public.request_milestone_proposal_items
  WHERE proposal_id = p_proposal_id;

  INSERT INTO public.request_milestone_proposal_items (
    proposal_id,
    position,
    title,
    description,
    amount_major
  )
  SELECT
    p_proposal_id,
    parsed.milestone_position,
    parsed.title,
    parsed.description,
    parsed.amount_major
  FROM public.parse_milestone_items_json(p_items) AS parsed;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_milestone_proposal_items(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_milestone_proposal_items(uuid, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Partial milestone payout (service_role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wallet_release_milestone_kobo(
  p_reference text,
  p_request_id uuid,
  p_recipient_user_id uuid,
  p_total_kobo bigint,
  p_provider_kobo bigint,
  p_fee_kobo bigint,
  p_milestone_id uuid
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

  IF p_total_kobo IS NULL OR p_total_kobo <= 0 THEN
    RAISE EXCEPTION 'milestone total must be positive' USING errcode = '22023';
  END IF;

  IF p_provider_kobo + p_fee_kobo <> p_total_kobo THEN
    RAISE EXCEPTION 'milestone amounts must sum to total' USING errcode = '22023';
  END IF;

  v_release_ref := p_reference || ':escrow_release';
  v_payout_ref := p_reference || ':payout';
  v_fee_ref := p_reference || ':service_fee';

  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions wt WHERE wt.reference = v_payout_ref
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_lock
  FROM public.payment_locks pl
  WHERE pl.request_id = p_request_id
  FOR UPDATE;

  IF v_lock.request_id IS NULL THEN
    RAISE EXCEPTION 'payment lock not found' USING errcode = 'P0002';
  END IF;

  IF v_lock.status <> 'active'::public.payment_lock_status THEN
    RAISE EXCEPTION 'payment lock is not active' USING errcode = '55000';
  END IF;

  IF v_lock.released_total_kobo + p_total_kobo > v_lock.total THEN
    RAISE EXCEPTION 'milestone release would exceed locked funds' USING errcode = '55000';
  END IF;

  IF v_lock.released_provider_kobo + p_provider_kobo > v_lock.provider_amount THEN
    RAISE EXCEPTION 'milestone provider release would exceed escrow' USING errcode = '55000';
  END IF;

  IF v_lock.released_fee_kobo + p_fee_kobo > v_lock.service_fee THEN
    RAISE EXCEPTION 'milestone fee release would exceed escrow' USING errcode = '55000';
  END IF;

  PERFORM public.wallet_apply_entry(
    v_release_ref,
    v_lock.user_id,
    p_request_id,
    'escrow_release'::public.wallet_transaction_type,
    0,
    -p_total_kobo,
    'Milestone escrow released',
    jsonb_build_object(
      'legacy_kind', 'escrow_release',
      'milestone_id', p_milestone_id
    )
  );

  PERFORM public.wallet_credit_kobo(
    v_payout_ref,
    p_recipient_user_id,
    p_provider_kobo,
    'payout'::public.wallet_transaction_type,
    'Milestone payment received',
    NULL,
    p_request_id,
    jsonb_build_object('legacy_kind', 'pay_provider', 'milestone_id', p_milestone_id)
  );

  IF p_fee_kobo > 0 THEN
    PERFORM public.wallet_apply_entry(
      v_fee_ref,
      v_lock.user_id,
      p_request_id,
      'service_fee'::public.wallet_transaction_type,
      0,
      0,
      'Milestone service fee',
      jsonb_build_object('legacy_kind', 'service_fee', 'milestone_id', p_milestone_id),
      NULL,
      p_fee_kobo
    );
  END IF;

  UPDATE public.payment_locks
  SET
    released_total_kobo = released_total_kobo + p_total_kobo,
    released_provider_kobo = released_provider_kobo + p_provider_kobo,
    released_fee_kobo = released_fee_kobo + p_fee_kobo,
    status = CASE
      WHEN released_total_kobo + p_total_kobo >= total THEN 'released'::public.payment_lock_status
      ELSE status
    END
  WHERE request_id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_release_milestone_kobo(
  text, uuid, uuid, bigint, bigint, bigint, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_release_milestone_kobo(
  text, uuid, uuid, bigint, bigint, bigint, uuid
) TO service_role;

-- ---------------------------------------------------------------------------
-- sync_wallet: skip full release when escrow already fully released by milestones
-- ---------------------------------------------------------------------------

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
  v_structure public.payment_structure;
  v_lock_status public.payment_lock_status;
  v_released_total bigint;
  v_lock_total bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.payment_locks pl WHERE pl.request_id = p_request_id) THEN
    RETURN;
  END IF;

  SELECT r.selected_user_id, r.payment_structure
    INTO v_selected_user_id, v_structure
  FROM public.requests r
  WHERE r.id = p_request_id;

  IF p_from = 'locked' AND p_to = 'pending' THEN
    PERFORM public.wallet_shift_lock_bucket(
      p_idempotency_key || ':escrow_pending',
      p_request_id,
      'pending'::public.payment_lock_bucket
    );
  ELSIF p_from = 'pending' AND p_to = 'released' THEN
    SELECT pl.status, pl.released_total_kobo, pl.total
      INTO v_lock_status, v_released_total, v_lock_total
    FROM public.payment_locks pl
    WHERE pl.request_id = p_request_id;

    IF v_structure = 'milestone'::public.payment_structure
       AND v_lock_status = 'released'::public.payment_lock_status
       AND v_released_total >= v_lock_total THEN
      NULL;
    ELSE
      PERFORM public.wallet_release_lock_kobo(
        p_idempotency_key,
        p_request_id,
        v_selected_user_id
      );
    END IF;
  ELSIF p_from = 'locked' AND p_to = 'refunded' THEN
    PERFORM public.wallet_refund_lock_kobo(p_idempotency_key, p_request_id);
  ELSIF p_from = 'pending' AND p_to = 'refunded' THEN
    PERFORM public.wallet_refund_lock_kobo(p_idempotency_key, p_request_id);
  ELSIF p_from = 'disputed' AND p_to = 'released' THEN
    SELECT pl.status, pl.released_total_kobo, pl.total
      INTO v_lock_status, v_released_total, v_lock_total
    FROM public.payment_locks pl
    WHERE pl.request_id = p_request_id;

    IF v_structure = 'milestone'::public.payment_structure
       AND v_lock_status = 'released'::public.payment_lock_status
       AND v_released_total >= v_lock_total THEN
      NULL;
    ELSE
      PERFORM public.wallet_release_lock_kobo(
        p_idempotency_key,
        p_request_id,
        v_selected_user_id
      );
    END IF;
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

REVOKE ALL ON FUNCTION public.sync_wallet_payment_transition(uuid, public.payment_status, public.payment_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_wallet_payment_transition(uuid, public.payment_status, public.payment_status, text) TO service_role;

-- Reset partial-release counters when re-locking a refunded row
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
        released_total_kobo = 0,
        released_provider_kobo = 0,
        released_fee_kobo = 0,
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
      status,
      released_total_kobo,
      released_provider_kobo,
      released_fee_kobo
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
      'active'::public.payment_lock_status,
      0,
      0,
      0
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

REVOKE ALL ON FUNCTION public.wallet_lock_funds_kobo(text, uuid, uuid, bigint, bigint, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wallet_lock_funds_kobo(text, uuid, uuid, bigint, bigint, bigint, text) TO service_role;