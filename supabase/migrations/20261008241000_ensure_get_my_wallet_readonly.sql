-- Re-assert read-only get_my_wallet (PostgREST rejects INSERT in STABLE RPCs, SQLSTATE 25006).

INSERT INTO public.wallets (user_id)
SELECT p.id
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.wallets w WHERE w.user_id = p.id
)
ON CONFLICT (user_id) DO NOTHING;

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
