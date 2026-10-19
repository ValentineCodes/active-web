-- Harden user payout bank accounts: timestamps, resolution audit, one default per user, idempotent save, RLS.

ALTER TABLE public.user_bank_accounts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz NOT NULL DEFAULT now();

UPDATE public.user_bank_accounts
SET updated_at = created_at,
    resolved_at = created_at;

CREATE UNIQUE INDEX IF NOT EXISTS user_bank_accounts_one_default_per_user_idx
  ON public.user_bank_accounts (user_id)
  WHERE is_default;

CREATE OR REPLACE FUNCTION public.user_bank_accounts_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_bank_accounts_touch_updated_at ON public.user_bank_accounts;

CREATE TRIGGER user_bank_accounts_touch_updated_at
  BEFORE UPDATE ON public.user_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.user_bank_accounts_touch_updated_at();

-- Defense in depth: even if table grants are misconfigured, direct API access stays scoped.
DROP POLICY IF EXISTS user_bank_accounts_select_own ON public.user_bank_accounts;
DROP POLICY IF EXISTS user_bank_accounts_modify_deny ON public.user_bank_accounts;

CREATE POLICY user_bank_accounts_select_own
  ON public.user_bank_accounts
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_bank_accounts_insert_deny
  ON public.user_bank_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY user_bank_accounts_update_deny
  ON public.user_bank_accounts
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY user_bank_accounts_delete_deny
  ON public.user_bank_accounts
  FOR DELETE
  TO authenticated
  USING (false);

-- Postgres cannot change RETURNS TABLE shape with CREATE OR REPLACE (SQLSTATE 42P13).
DROP FUNCTION IF EXISTS public.list_my_bank_accounts();

CREATE FUNCTION public.list_my_bank_accounts()
RETURNS TABLE (
  bank_account_id uuid,
  bank_code text,
  bank_name text,
  account_number text,
  account_name text,
  is_default boolean,
  can_delete boolean,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    a.id,
    a.bank_code,
    a.bank_name,
    a.account_number,
    a.account_name,
    a.is_default,
    NOT public.user_bank_account_pending_withdrawal_exists(a.user_id, a.id),
    a.created_at,
    a.updated_at,
    a.resolved_at
  FROM public.user_bank_accounts a
  WHERE a.user_id = public.assert_authenticated()
  ORDER BY a.is_default DESC, a.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_bank_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_bank_accounts() TO service_role;

CREATE OR REPLACE FUNCTION public.set_default_user_bank_account(p_bank_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_bank_accounts a
    WHERE a.id = p_bank_account_id
      AND a.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'bank account not found' USING errcode = '22023';
  END IF;

  UPDATE public.user_bank_accounts
  SET is_default = false,
      updated_at = now()
  WHERE user_id = v_user_id
    AND is_default = true
    AND id <> p_bank_account_id;

  UPDATE public.user_bank_accounts
  SET is_default = true,
      updated_at = now()
  WHERE id = p_bank_account_id
    AND user_id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_user_bank_account(
  p_user_id uuid,
  p_bank_code text,
  p_bank_name text,
  p_account_number text,
  p_account_name text,
  p_paystack_recipient_code text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_count integer;
  v_id uuid;
  v_make_default boolean;
  v_now timestamptz := now();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING errcode = '22023';
  END IF;

  IF p_account_number IS NULL OR p_account_number !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'account number must be 10 digits' USING errcode = '22023';
  END IF;

  SELECT count(*)::int
    INTO v_count
  FROM public.user_bank_accounts a
  WHERE a.user_id = p_user_id;

  v_make_default := v_count = 0;

  IF v_count >= 5
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_bank_accounts a
      WHERE a.user_id = p_user_id
        AND a.bank_code = btrim(p_bank_code)
        AND a.account_number = p_account_number
    )
  THEN
    RAISE EXCEPTION 'You can save up to 5 bank accounts' USING errcode = '22023';
  END IF;

  INSERT INTO public.user_bank_accounts (
    user_id,
    bank_code,
    bank_name,
    account_number,
    account_name,
    paystack_recipient_code,
    is_default,
    created_at,
    updated_at,
    resolved_at
  )
  VALUES (
    p_user_id,
    btrim(p_bank_code),
    btrim(p_bank_name),
    p_account_number,
    btrim(p_account_name),
    btrim(p_paystack_recipient_code),
    v_make_default,
    v_now,
    v_now,
    v_now
  )
  ON CONFLICT ON CONSTRAINT user_bank_accounts_user_account_unique DO UPDATE
  SET
    bank_name = EXCLUDED.bank_name,
    account_name = EXCLUDED.account_name,
    paystack_recipient_code = EXCLUDED.paystack_recipient_code,
    resolved_at = v_now,
    updated_at = v_now
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_bank_account_id_if_owned(
  p_user_id uuid,
  p_bank_code text,
  p_account_number text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT a.id
  FROM public.user_bank_accounts a
  WHERE a.user_id = p_user_id
    AND a.bank_code = btrim(p_bank_code)
    AND a.account_number = p_account_number
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_bank_account_id_if_owned(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_bank_account_id_if_owned(uuid, text, text) TO service_role;
