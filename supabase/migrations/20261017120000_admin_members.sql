-- Administrator roles for the operations dashboard. No direct client table access.

CREATE TYPE public.admin_role AS ENUM (
  'super_admin',
  'support_admin',
  'finance_admin'
);

COMMENT ON TYPE public.admin_role IS
  'super_admin: full access and member management; support_admin: users/requests/reports; finance_admin: wallets/transactions.';

CREATE TABLE public.admin_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.admin_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.admin_members IS
  'Active dashboard administrators. Rows are written only via service_role bootstrap or super_admin RPC.';

ALTER TABLE public.admin_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_members FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_members FROM anon;
REVOKE ALL ON TABLE public.admin_members FROM authenticated;
GRANT ALL ON TABLE public.admin_members TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_admin_permissions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_role public.admin_role;
BEGIN
  SELECT am.role
    INTO v_role
  FROM public.admin_members am
  WHERE am.user_id = auth.uid();

  IF v_role IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'role', v_role,
    'overview', true,
    'users', v_role IN ('super_admin'::public.admin_role, 'support_admin'::public.admin_role),
    'requests', v_role IN ('super_admin'::public.admin_role, 'support_admin'::public.admin_role),
    'reports', v_role IN ('super_admin'::public.admin_role, 'support_admin'::public.admin_role),
    'transactions', v_role IN ('super_admin'::public.admin_role, 'finance_admin'::public.admin_role),
    'wallets', v_role IN ('super_admin'::public.admin_role, 'finance_admin'::public.admin_role),
    'withdrawals', v_role IN ('super_admin'::public.admin_role, 'finance_admin'::public.admin_role),
    'operational_issues', v_role IN ('super_admin'::public.admin_role, 'support_admin'::public.admin_role),
    'audit_logs', v_role = 'super_admin'::public.admin_role,
    'settings', v_role = 'super_admin'::public.admin_role
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_admin_permissions() IS
  'Returns dashboard permission flags for the current auth user, or NULL if not an administrator.';

REVOKE ALL ON FUNCTION public.get_my_admin_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_admin_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_admin_permissions() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_provision_member(
  p_user_id uuid,
  p_role public.admin_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_admin_caller();

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'user not found' USING errcode = 'P0002';
  END IF;

  INSERT INTO public.admin_members (user_id, role, created_by)
  VALUES (p_user_id, p_role, NULL)
  ON CONFLICT (user_id) DO UPDATE
  SET
    role = EXCLUDED.role,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_provision_member(uuid, public.admin_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_provision_member(uuid, public.admin_role) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_grant_member(
  p_user_id uuid,
  p_role public.admin_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller_role public.admin_role;
BEGIN
  SELECT am.role
    INTO v_caller_role
  FROM public.admin_members am
  WHERE am.user_id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'super_admin'::public.admin_role THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'user not found' USING errcode = 'P0002';
  END IF;

  INSERT INTO public.admin_members (user_id, role, created_by)
  VALUES (p_user_id, p_role, auth.uid())
  ON CONFLICT (user_id) DO UPDATE
  SET
    role = EXCLUDED.role,
    updated_at = now(),
    created_by = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_member(uuid, public.admin_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_member(uuid, public.admin_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_member(uuid, public.admin_role) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_revoke_member(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller_role public.admin_role;
BEGIN
  SELECT am.role
    INTO v_caller_role
  FROM public.admin_members am
  WHERE am.user_id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'super_admin'::public.admin_role THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required' USING errcode = '22023';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'you cannot revoke your own administrator access' USING errcode = '55000';
  END IF;

  DELETE FROM public.admin_members am
  WHERE am.user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_member(uuid) TO service_role;
