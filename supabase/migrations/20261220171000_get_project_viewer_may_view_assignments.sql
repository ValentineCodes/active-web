-- Explicit viewer_may_view_assignments for project detail gating.

DROP FUNCTION IF EXISTS public.get_project(uuid);

CREATE OR REPLACE FUNCTION public.get_project(p_project_id uuid)
RETURNS TABLE(
  project_id uuid,
  creator_id uuid,
  creator_display_name text,
  creator_avatar_path text,
  creator_bio text,
  creator_rating_average numeric,
  creator_rating_count integer,
  creator_completion_percent integer,
  creator_identity_verified boolean,
  title text,
  description text,
  attachment_path text,
  project_visibility public.project_visibility,
  funding_visibility public.project_funding_visibility,
  budget_total_kobo bigint,
  min_funding_target_kobo bigint,
  min_contribution_kobo bigint,
  funding_deadline_at timestamptz,
  funding_timezone text,
  funding_opened_at timestamptz,
  status public.project_status,
  funding_status public.project_funding_status,
  min_target_reached_at timestamptz,
  fully_funded_at timestamptz,
  funding_unsuccessful_at timestamptz,
  contributed_total_kobo bigint,
  reserved_total_kobo bigint,
  committed_compensation_kobo bigint,
  viewer_is_creator boolean,
  viewer_is_contributor boolean,
  viewer_may_view_assignments boolean,
  viewer_may_contribute boolean,
  tag_slugs text[],
  location_label text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  PERFORM public.assert_may_view_project(p_project_id, v_user_id);
  PERFORM public.evaluate_project_funding_status(p_project_id);

  RETURN QUERY
  SELECT
    p.id,
    p.creator_id,
    prof.display_name,
    prof.avatar_path,
    prof.bio,
    prof.rating_average,
    prof.rating_count,
    public.requester_completion_percent(p.creator_id),
    public.user_marketplace_identity_verified(prof.id),
    p.title,
    p.description,
    p.attachment_path,
    p.project_visibility,
    p.funding_visibility,
    p.budget_total_kobo,
    p.min_funding_target_kobo,
    p.min_contribution_kobo,
    p.funding_deadline_at,
    p.funding_timezone,
    p.funding_opened_at,
    p.status,
    p.funding_status,
    p.min_target_reached_at,
    p.fully_funded_at,
    p.funding_unsuccessful_at,
    pool.contributed_total_kobo,
    pool.reserved_total_kobo,
    pool.committed_compensation_kobo,
    p.creator_id = v_user_id,
    EXISTS (
      SELECT 1
      FROM public.project_contributions pc
      WHERE pc.project_id = p.id
        AND pc.contributor_id = v_user_id
    ),
    (
      p.creator_id = v_user_id
      OR EXISTS (
        SELECT 1
        FROM public.project_contributions pc
        WHERE pc.project_id = p.id
          AND pc.contributor_id = v_user_id
      )
    ),
    (
      p.funding_status IN (
        'open'::public.project_funding_status,
        'target_met'::public.project_funding_status
      )
      AND (
        p.funding_visibility = 'public'::public.project_funding_visibility
        OR p.creator_id = v_user_id
        OR EXISTS (
          SELECT 1
          FROM public.project_contributor_invitations inv
          WHERE inv.project_id = p.id AND inv.invitee_id = v_user_id
        )
      )
    ),
    coalesce(
      (
        SELECT array_agg(t.slug ORDER BY t.slug)
        FROM public.project_tags pt
        JOIN public.tags t ON t.id = pt.tag_id
        WHERE pt.project_id = p.id
      ),
      '{}'::text[]
    ),
    p.location_label
  FROM public.projects p
  JOIN public.project_funding_pools pool ON pool.project_id = p.id
  JOIN public.profiles prof ON prof.id = p.creator_id
  WHERE p.id = p_project_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project(uuid) TO authenticated;