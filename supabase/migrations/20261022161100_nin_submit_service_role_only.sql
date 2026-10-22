-- Ensure NIN submission RPC is not callable by client roles (Edge Function uses service_role).

REVOKE ALL ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text) TO service_role;
