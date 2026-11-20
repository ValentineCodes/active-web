-- Project photos live in request-media (same path layout as requests). Storage SELECT
-- previously only checked requests; extend so viewers who may see a project can sign URLs.

CREATE OR REPLACE FUNCTION public.project_media_visible_to_party(
  p_user_id uuid,
  p_name text
) RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects pr
    WHERE pr.attachment_path = p_name
      AND (
        pr.creator_id = p_user_id
        OR EXISTS (
          SELECT 1
          FROM public.project_contributions pc
          WHERE pc.project_id = pr.id AND pc.contributor_id = p_user_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.project_assignments a
          WHERE a.project_id = pr.id AND a.worker_id = p_user_id
        )
        OR (
          pr.status = 'live'::public.project_status
          AND (
            pr.funding_visibility = 'public'::public.project_funding_visibility
            OR EXISTS (
              SELECT 1
              FROM public.project_contributor_invitations inv
              WHERE inv.project_id = pr.id AND inv.invitee_id = p_user_id
            )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.project_media_visible_to_party(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_media_visible_to_party(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_media_visible_to_party(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.can_read_request_media(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    (storage.foldername(p_name))[1] = (SELECT auth.uid())::text
    OR public.request_media_visible_to_party((SELECT auth.uid()), p_name)
    OR public.project_media_visible_to_party((SELECT auth.uid()), p_name)
    OR (
      coalesce((public.get_my_admin_permissions()->>'reports')::boolean, false)
      AND EXISTS (
        SELECT 1
        FROM public.service_problems sp
        WHERE p_name = ANY (sp.evidence_paths)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_request_media(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_request_media(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_request_media(text) TO service_role;