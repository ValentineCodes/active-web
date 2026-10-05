-- Deposits must go through Paystack settlement; withdrawals are not productized yet.
-- Legacy RPCs remain for service_role / migrations only.

REVOKE ALL ON FUNCTION public.wallet_top_up(numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_top_up(numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_top_up(numeric, text) TO service_role;

REVOKE ALL ON FUNCTION public.wallet_withdraw(numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wallet_withdraw(numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_withdraw(numeric, text) TO service_role;

CREATE OR REPLACE FUNCTION public.wallet_top_up(p_amount numeric, p_idempotency_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'Wallet top-up is only available through Paystack deposit'
    USING errcode = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_withdraw(p_amount numeric, p_idempotency_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'Wallet withdrawal is not available yet'
    USING errcode = '42501';
END;
$$;
