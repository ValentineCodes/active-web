-- User payout bank accounts (Paystack NUBAN). Client reads via SECURITY DEFINER RPCs; writes on save via service_role.

CREATE TABLE public.user_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  bank_code text NOT NULL,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  paystack_recipient_code text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_bank_accounts_bank_code_check CHECK (char_length(btrim(bank_code)) > 0),
  CONSTRAINT user_bank_accounts_bank_name_check CHECK (char_length(btrim(bank_name)) > 0),
  CONSTRAINT user_bank_accounts_account_number_check CHECK (account_number ~ '^[0-9]{10}$'),
  CONSTRAINT user_bank_accounts_account_name_check CHECK (char_length(btrim(account_name)) > 0),
  CONSTRAINT user_bank_accounts_recipient_code_check CHECK (char_length(btrim(paystack_recipient_code)) > 0),
  CONSTRAINT user_bank_accounts_user_account_unique UNIQUE (user_id, bank_code, account_number)
);

CREATE INDEX user_bank_accounts_user_default_idx
  ON public.user_bank_accounts (user_id, is_default DESC, created_at DESC);

ALTER TABLE public.user_bank_accounts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_bank_accounts FROM PUBLIC;

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
    FROM public.wallet_transactions wt
    WHERE wt.user_id = p_user_id
      AND wt.type = 'withdrawal'::public.wallet_transaction_type
      AND wt.status = 'pending'::public.wallet_transaction_status
      AND wt.metadata ->> 'bank_account_id' = p_bank_account_id::text
  );
$$;

REVOKE ALL ON FUNCTION public.user_bank_account_pending_withdrawal_exists(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_bank_account_pending_withdrawal_exists(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.list_my_bank_accounts()
RETURNS TABLE (
  bank_account_id uuid,
  bank_code text,
  bank_name text,
  account_number text,
  account_name text,
  is_default boolean,
  can_delete boolean,
  created_at timestamptz
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
    a.created_at
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
  UPDATE public.user_bank_accounts
  SET is_default = false
  WHERE user_id = v_user_id
    AND is_default = true;

  UPDATE public.user_bank_accounts
  SET is_default = true
  WHERE id = p_bank_account_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bank account not found' USING errcode = '22023';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_default_user_bank_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_user_bank_account(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_user_bank_account(p_bank_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_was_default boolean;
  v_next_id uuid;
BEGIN
  IF public.user_bank_account_pending_withdrawal_exists(v_user_id, p_bank_account_id) THEN
    RAISE EXCEPTION 'This account is tied to a withdrawal in progress'
      USING errcode = '55000';
  END IF;

  SELECT a.is_default
    INTO v_was_default
  FROM public.user_bank_accounts a
  WHERE a.id = p_bank_account_id
    AND a.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'bank account not found' USING errcode = '22023';
  END IF;

  DELETE FROM public.user_bank_accounts
  WHERE id = p_bank_account_id
    AND user_id = v_user_id;

  IF v_was_default THEN
    SELECT a.id
      INTO v_next_id
    FROM public.user_bank_accounts a
    WHERE a.user_id = v_user_id
    ORDER BY a.created_at DESC
    LIMIT 1;

    IF v_next_id IS NOT NULL THEN
      UPDATE public.user_bank_accounts
      SET is_default = true
      WHERE id = v_next_id
        AND user_id = v_user_id;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_bank_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_bank_account(uuid) TO service_role;

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

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'You can save up to 5 bank accounts' USING errcode = '22023';
  END IF;

  v_make_default := v_count = 0;

  INSERT INTO public.user_bank_accounts (
    user_id,
    bank_code,
    bank_name,
    account_number,
    account_name,
    paystack_recipient_code,
    is_default
  )
  VALUES (
    p_user_id,
    btrim(p_bank_code),
    btrim(p_bank_name),
    p_account_number,
    btrim(p_account_name),
    btrim(p_paystack_recipient_code),
    v_make_default
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_user_bank_account(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_user_bank_account(uuid, text, text, text, text, text) TO service_role;
