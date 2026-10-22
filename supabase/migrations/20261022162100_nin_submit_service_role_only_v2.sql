REVOKE ALL ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_user_nin_encrypted(uuid, bytea, bytea, text, text, text) TO service_role;
