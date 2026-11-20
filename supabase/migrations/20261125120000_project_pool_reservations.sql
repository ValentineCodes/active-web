-- Project pool reservations and contribution attribution schema (Phase 6).
-- Per-contribution reservation allocation and contributor refunds require UD-19 (stub only).

CREATE TYPE public.project_pool_reservation_status AS ENUM (
  'active',
  'released'
);

ALTER TABLE public.project_funding_pools
  ADD CONSTRAINT project_funding_pools_reserved_lte_contributed CHECK (
    reserved_total_kobo <= contributed_total_kobo
  );

CREATE TABLE public.project_pool_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  amount_kobo bigint NOT NULL,
  status public.project_pool_reservation_status NOT NULL DEFAULT 'active'::public.project_pool_reservation_status,
  reserve_reference text NOT NULL,
  release_reference text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  CONSTRAINT project_pool_reservations_amount_positive CHECK (amount_kobo > 0),
  CONSTRAINT project_pool_reservations_reserve_reference_key UNIQUE (reserve_reference)
);

CREATE UNIQUE INDEX project_pool_reservations_release_reference_key
  ON public.project_pool_reservations (release_reference)
  WHERE release_reference IS NOT NULL;

CREATE INDEX project_pool_reservations_project_idx
  ON public.project_pool_reservations (project_id, created_at);

COMMENT ON TABLE public.project_pool_reservations IS
  'Creator-controlled slices of the shared pool set aside (e.g. for assignment compensation).';

CREATE TABLE public.project_contribution_reservation_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id uuid NOT NULL REFERENCES public.project_contributions (id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.project_pool_reservations (id) ON DELETE CASCADE,
  amount_kobo bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_contribution_reservation_allocations_amount_positive CHECK (amount_kobo > 0),
  CONSTRAINT project_contribution_reservation_allocations_unique
    UNIQUE (contribution_id, reservation_id)
);

CREATE INDEX project_contribution_reservation_allocations_contribution_idx
  ON public.project_contribution_reservation_allocations (contribution_id);

COMMENT ON TABLE public.project_contribution_reservation_allocations IS
  'Per-contribution slices of each pool reservation. Rows are written only by the UD-19 allocation RPC.';

ALTER TABLE public.project_pool_reservations OWNER TO postgres;
ALTER TABLE public.project_contribution_reservation_allocations OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.project_pool_unreserved_kobo(p_project_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT greatest(
    pool.contributed_total_kobo - pool.reserved_total_kobo,
    0::bigint
  )
  FROM public.project_funding_pools pool
  WHERE pool.project_id = p_project_id;
$$;

CREATE OR REPLACE FUNCTION public.project_reservations_fully_attributed(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    (
      SELECT bool_and(attributed.total = r.amount_kobo)
      FROM public.project_pool_reservations r
      LEFT JOIN LATERAL (
        SELECT coalesce(sum(a.amount_kobo), 0::bigint) AS total
        FROM public.project_contribution_reservation_allocations a
        WHERE a.reservation_id = r.id
      ) attributed ON true
      WHERE r.project_id = p_project_id
        AND r.status = 'active'::public.project_pool_reservation_status
    ),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.attribute_project_reservation_to_contributions(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_reservation_id IS NULL THEN
    RAISE EXCEPTION 'reservation id is required' USING errcode = '22023';
  END IF;

  RAISE EXCEPTION
    'contribution reservation allocation is not available until UD-19 is approved'
    USING errcode = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_project_contribution_reserved_from_allocations(p_contribution_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_total bigint;
BEGIN
  SELECT coalesce(sum(a.amount_kobo), 0)
  INTO v_total
  FROM public.project_contribution_reservation_allocations a
  WHERE a.contribution_id = p_contribution_id;

  UPDATE public.project_contributions pc
  SET reserved_kobo = v_total
  WHERE pc.id = p_contribution_id
    AND pc.reserved_kobo IS DISTINCT FROM v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_project_contribution_accounting(p_contribution_id uuid)
RETURNS TABLE(
  contribution_id uuid,
  project_id uuid,
  contributor_id uuid,
  gross_amount_kobo bigint,
  reserved_kobo bigint,
  refunded_kobo bigint,
  eligible_refund_kobo bigint,
  reservations_attributed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_row public.project_contributions%rowtype;
  v_attributed boolean;
BEGIN
  SELECT * INTO v_row
  FROM public.project_contributions pc
  WHERE pc.id = p_contribution_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'contribution not found' USING errcode = 'P0002';
  END IF;

  IF v_row.contributor_id <> v_user_id
     AND NOT EXISTS (
       SELECT 1 FROM public.projects p
       WHERE p.id = v_row.project_id AND p.creator_id = v_user_id
     ) THEN
    RAISE EXCEPTION 'contribution not found' USING errcode = 'P0002';
  END IF;

  v_attributed := public.project_reservations_fully_attributed(v_row.project_id);

  RETURN QUERY
  SELECT
    v_row.id,
    v_row.project_id,
    v_row.contributor_id,
    v_row.amount_kobo,
    v_row.reserved_kobo,
    v_row.refunded_kobo,
    CASE
      WHEN v_attributed
        THEN greatest(v_row.amount_kobo - v_row.reserved_kobo - v_row.refunded_kobo, 0::bigint)
      ELSE NULL::bigint
    END,
    v_attributed;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_project_pool_kobo(
  p_project_id uuid,
  p_amount_major numeric,
  p_idempotency_key text,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_amount_kobo bigint;
  v_reference text;
  v_reservation_id uuid;
  v_unreserved bigint;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id AND p.creator_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'project not found' USING errcode = 'P0002';
  END IF;

  PERFORM public.assert_project_assignments_allowed(p_project_id);

  v_amount_kobo := public.ngn_major_to_kobo(p_amount_major);
  IF v_amount_kobo <= 0 THEN
    RAISE EXCEPTION 'reservation amount must be positive' USING errcode = '22023';
  END IF;

  v_reference := 'project_pool_reserve:' || p_idempotency_key;

  IF EXISTS (
    SELECT 1 FROM public.project_pool_reservations r WHERE r.reserve_reference = v_reference
  ) THEN
    RETURN (
      SELECT r.id FROM public.project_pool_reservations r WHERE r.reserve_reference = v_reference
    );
  END IF;

  PERFORM 1
  FROM public.project_funding_pools pool
  WHERE pool.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'funding pool not found' USING errcode = 'P0002';
  END IF;

  v_unreserved := public.project_pool_unreserved_kobo(p_project_id);

  IF v_amount_kobo > v_unreserved THEN
    RAISE EXCEPTION 'insufficient unreserved pool funds' USING errcode = '55000';
  END IF;

  INSERT INTO public.project_pool_reservations (
    project_id,
    amount_kobo,
    reserve_reference,
    note
  )
  VALUES (p_project_id, v_amount_kobo, v_reference, nullif(btrim(p_note), ''))
  RETURNING id INTO v_reservation_id;

  UPDATE public.project_funding_pools pool
  SET reserved_total_kobo = pool.reserved_total_kobo + v_amount_kobo
  WHERE pool.project_id = p_project_id;

  RETURN v_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_project_pool_reservation(
  p_reservation_id uuid,
  p_idempotency_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_reservation public.project_pool_reservations%rowtype;
  v_release_ref text;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = '22023';
  END IF;

  v_release_ref := 'project_pool_release:' || p_idempotency_key;

  IF EXISTS (
    SELECT 1
    FROM public.project_pool_reservations r
    WHERE r.release_reference = v_release_ref
  ) THEN
    RETURN;
  END IF;

  SELECT r.* INTO v_reservation
  FROM public.project_pool_reservations r
  JOIN public.projects p ON p.id = r.project_id
  WHERE r.id = p_reservation_id
    AND p.creator_id = v_user_id
  FOR UPDATE;

  IF v_reservation.id IS NULL THEN
    RAISE EXCEPTION 'reservation not found' USING errcode = 'P0002';
  END IF;

  IF v_reservation.status = 'released'::public.project_pool_reservation_status THEN
    IF v_reservation.release_reference = v_release_ref THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'reservation is already released' USING errcode = '55000';
  END IF;

  UPDATE public.project_pool_reservations r
  SET status = 'released'::public.project_pool_reservation_status,
      release_reference = v_release_ref,
      released_at = now()
  WHERE r.id = p_reservation_id;

  UPDATE public.project_funding_pools pool
  SET reserved_total_kobo = pool.reserved_total_kobo - v_reservation.amount_kobo
  WHERE pool.project_id = v_reservation.project_id;

  PERFORM public.sync_project_contribution_reserved_from_allocations(contrib.contribution_id)
  FROM (
    SELECT DISTINCT a.contribution_id
    FROM public.project_contribution_reservation_allocations a
    WHERE a.reservation_id = p_reservation_id
  ) contrib;

  DELETE FROM public.project_contribution_reservation_allocations a
  WHERE a.reservation_id = p_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_project_contribution_refund(p_contribution_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_contribution_id IS NULL THEN
    RAISE EXCEPTION 'contribution id is required' USING errcode = '22023';
  END IF;

  RAISE EXCEPTION
    'contributor refund accounting requires UD-19 (allocation and rounding rules)'
    USING errcode = 'P0001';
END;
$$;

ALTER TABLE public.project_pool_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_contribution_reservation_allocations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.project_pool_reservations FROM PUBLIC;
REVOKE ALL ON TABLE public.project_contribution_reservation_allocations FROM PUBLIC;

GRANT SELECT ON TABLE public.project_pool_reservations TO service_role;
GRANT SELECT ON TABLE public.project_contribution_reservation_allocations TO service_role;

GRANT EXECUTE ON FUNCTION public.reserve_project_pool_kobo(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_project_pool_reservation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_contribution_accounting(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_project_reservation_to_contributions(uuid) TO authenticated;