-- Project budget breakdown: authoritative paid-out, secured-unpaid, and available pool figures.
--
-- Accounting (source of truth):
-- - contributed_total_kobo: project_funding_pools.contributed_total_kobo (raised).
-- - paid_out_total_kobo: SUM(project_assignment_payments.total_kobo) for the project.
-- - reserved_total_kobo: SUM(secured assignment compensation not yet paid out)
--     = SUM(project_assignment_reservations.amount_kobo - released_kobo).
-- - available_total_kobo: uncommitted pool funds for new reservations
--     = project_pool_unreserved_kobo (contributed - pool.reserved_total_kobo).
-- Pool reserved_total_kobo tracks earmarked slices; assignment released_kobo tracks payouts
-- without reducing pool.reserved until release_project_pool_reservation — do not subtract
-- paid_out again from available.

CREATE OR REPLACE FUNCTION public.project_paid_out_total_kobo(p_project_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(sum(pay.total_kobo), 0::bigint)
  FROM public.project_assignment_payments pay
  JOIN public.project_assignments a ON a.id = pay.assignment_id
  WHERE a.project_id = p_project_id;
$$;

CREATE OR REPLACE FUNCTION public.project_secured_unpaid_kobo(p_project_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(sum(r.amount_kobo - r.released_kobo), 0::bigint)
  FROM public.project_assignment_reservations r
  JOIN public.project_assignments a ON a.id = r.assignment_id
  WHERE a.project_id = p_project_id;
$$;

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
  committed_compensation_kobo bigint,
  pool_reserved_total_kobo bigint,
  paid_out_total_kobo bigint,
  reserved_total_kobo bigint,
  available_total_kobo bigint,
  viewer_is_creator boolean,
  viewer_is_contributor boolean,
  viewer_may_view_assignments boolean,
  viewer_may_contribute boolean,
  viewer_may_view_budget_breakdown boolean,
  tag_slugs text[],
  location_label text,
  group_chat_conversation_id uuid,
  group_chat_unread_count integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_may_breakdown boolean;
  v_group_id uuid;
BEGIN
  PERFORM public.assert_may_view_project(p_project_id, v_user_id);
  PERFORM public.evaluate_project_funding_status(p_project_id);

  v_group_id := public.project_group_conversation_for_project(p_project_id, v_user_id);

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id AS project_id,
      p.creator_id,
      p.creator_id = v_user_id AS is_creator,
      EXISTS (
        SELECT 1
        FROM public.project_contributions pc
        WHERE pc.project_id = p.id AND pc.contributor_id = v_user_id
      ) AS is_contributor,
      prof.display_name AS creator_display_name,
      prof.avatar_path AS creator_avatar_path,
      prof.bio AS creator_bio,
      prof.rating_average AS creator_rating_average,
      prof.rating_count AS creator_rating_count,
      public.requester_completion_percent(p.creator_id) AS creator_completion_percent,
      public.user_marketplace_identity_verified(prof.id) AS creator_identity_verified,
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
      pool.committed_compensation_kobo,
      pool.reserved_total_kobo AS pool_reserved,
      p.location_label
    FROM public.projects p
    JOIN public.project_funding_pools pool ON pool.project_id = p.id
    JOIN public.profiles prof ON prof.id = p.creator_id
    WHERE p.id = p_project_id
  )
  SELECT
    b.project_id,
    b.creator_id,
    b.creator_display_name,
    b.creator_avatar_path,
    b.creator_bio,
    b.creator_rating_average,
    b.creator_rating_count,
    b.creator_completion_percent,
    b.creator_identity_verified,
    b.title,
    b.description,
    b.attachment_path,
    b.project_visibility,
    b.funding_visibility,
    b.budget_total_kobo,
    b.min_funding_target_kobo,
    b.min_contribution_kobo,
    b.funding_deadline_at,
    b.funding_timezone,
    b.funding_opened_at,
    b.status,
    b.funding_status,
    b.min_target_reached_at,
    b.fully_funded_at,
    b.funding_unsuccessful_at,
    b.contributed_total_kobo,
    b.committed_compensation_kobo,
    b.pool_reserved,
    CASE WHEN (b.is_creator OR b.is_contributor) THEN public.project_paid_out_total_kobo(b.project_id) ELSE NULL END,
    CASE WHEN (b.is_creator OR b.is_contributor) THEN public.project_secured_unpaid_kobo(b.project_id) ELSE NULL END,
    CASE WHEN (b.is_creator OR b.is_contributor) THEN public.project_pool_unreserved_kobo(b.project_id) ELSE NULL END,
    b.is_creator,
    b.is_contributor,
    (b.is_creator OR b.is_contributor),
    (
      b.funding_status IN (
        'open'::public.project_funding_status,
        'target_met'::public.project_funding_status
      )
      AND (
        b.funding_visibility = 'public'::public.project_funding_visibility
        OR b.is_creator
        OR EXISTS (
          SELECT 1
          FROM public.project_contributor_invitations inv
          WHERE inv.project_id = b.project_id AND inv.invitee_id = v_user_id
        )
      )
    ),
    (b.is_creator OR b.is_contributor),
    coalesce(
      (
        SELECT array_agg(t.slug ORDER BY t.slug)
        FROM public.project_tags pt
        JOIN public.tags t ON t.id = pt.tag_id
        WHERE pt.project_id = b.project_id
      ),
      '{}'::text[]
    ),
    b.location_label,
    v_group_id,
    CASE
      WHEN v_group_id IS NULL THEN 0
      ELSE public.project_group_unread_count(v_group_id, v_user_id)
    END
  FROM base b;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project(uuid) TO authenticated;