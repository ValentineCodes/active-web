-- send_request_message and attachment RPCs call conversation_sending_allowed(uuid), which was
-- narrowed to request threads in 20261015131000. Route through the participant dispatcher so
-- project pre-handshake conversations can send.

CREATE OR REPLACE FUNCTION public.conversation_sending_allowed(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.conversation_sending_allowed_for_participant(
    p_conversation_id,
    public.assert_authenticated()
  );
$$;

COMMENT ON FUNCTION public.conversation_sending_allowed(uuid) IS
  'Whether the current user may send in this conversation; delegates to per-participant rules (requests and projects).';

REVOKE ALL ON FUNCTION public.conversation_sending_allowed(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_sending_allowed(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.conversation_sending_allowed(uuid) TO service_role;