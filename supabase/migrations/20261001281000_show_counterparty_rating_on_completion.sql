-- Completion UI shows the counterparty's rating of the viewer, not the viewer's own submission.

DROP FUNCTION IF EXISTS public.get_engagement(uuid);

CREATE OR REPLACE FUNCTION public.get_engagement(p_request_id uuid)
RETURNS TABLE(
  request_id uuid,
  title text,
  description text,
  scheduled_for timestamp with time zone,
  offered_amount numeric,
  agreed_provider_amount numeric,
  quoted_amount numeric,
  currency text,
  request_status public.request_status,
  payment_status public.payment_status,
  accepted_at timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  completion_confirm_by timestamp with time zone,
  service_problem_kind public.service_problem_kind,
  service_problem_respond_by timestamp with time zone,
  service_problem_reported_by_me boolean,
  service_problem_description text,
  viewer_is_requester boolean,
  location_label text,
  request_latitude double precision,
  request_longitude double precision,
  counterparty_id uuid,
  counterparty_display_name text,
  counterparty_avatar_path text,
  counterparty_phone text,
  counterparty_bio text,
  counterparty_rating_average numeric,
  counterparty_rating_count integer,
  counterparty_completion_percent integer,
  rating_stars smallint,
  rating_comment text,
  viewer_has_rated boolean,
  handshake_id uuid,
  handshake_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH me AS (SELECT public.assert_authenticated() AS user_id)
  SELECT
    r.id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.agreed_provider_amount,
    accepted.quoted_amount,
    r.currency,
    r.status,
    r.payment_status,
    r.accepted_at,
    r.started_at,
    r.completed_at,
    r.completion_confirm_by,
    sp.kind,
    sp.respond_by,
    sp.reported_by = me.user_id,
    sp.description,
    r.requester_id = me.user_id,
    r.location_label,
    extensions.ST_Y(r.location::extensions.geometry),
    extensions.ST_X(r.location::extensions.geometry),
    counterparty.id,
    counterparty.display_name,
    counterparty.avatar_path,
    counterparty.phone,
    counterparty.bio,
    counterparty.rating_average,
    counterparty.rating_count,
    CASE
      WHEN counterparty.id = r.selected_user_id THEN public.provider_completion_percent(counterparty.id)
      ELSE public.requester_completion_percent(counterparty.id)
    END,
    received.stars,
    received.comment,
    EXISTS (
      SELECT 1
      FROM public.ratings submitted
      WHERE submitted.request_id = r.id
        AND submitted.rater_id = me.user_id
    ),
    h.id,
    h.created_at
  FROM me
  JOIN public.requests r
    ON r.id = p_request_id
   AND r.status IN (
     'accepted',
     'in_progress',
     'completion_pending',
     'completed',
     'disputed',
     'no_show'
   )
   AND me.user_id IN (r.requester_id, r.selected_user_id)
  JOIN public.profiles counterparty
    ON counterparty.id = CASE
      WHEN r.requester_id = me.user_id THEN r.selected_user_id
      ELSE r.requester_id
    END
  LEFT JOIN public.request_responses accepted ON accepted.id = r.accepted_response_id
  LEFT JOIN public.service_problems sp
    ON sp.request_id = r.id
   AND sp.status = 'open'
  LEFT JOIN public.ratings received
    ON received.request_id = r.id
   AND received.ratee_id = me.user_id
   AND received.rater_id = counterparty.id
  LEFT JOIN public.handshakes h ON h.request_id = r.id;
$$;

GRANT ALL ON FUNCTION public.get_engagement(uuid) TO anon;
GRANT ALL ON FUNCTION public.get_engagement(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_engagement(uuid) TO service_role;

DROP VIEW IF EXISTS "public"."my_requests";

CREATE VIEW "public"."my_requests" WITH ("security_invoker"='on') AS
 SELECT
    r.id AS request_id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.agreed_provider_amount,
    r.currency,
    r.payment_status,
    r.location_label,
    extensions.st_y((r.location)::extensions.geometry) AS latitude,
    extensions.st_x((r.location)::extensions.geometry) AS longitude,
        CASE
            WHEN ((r.status = 'posted'::public.request_status) AND (r.expires_at <= now())) THEN 'expired'::public.request_status
            ELSE r.status
        END AS status,
    r.selected_user_id,
    r.source_request_id,
    ( SELECT (count(*))::integer AS count
           FROM public.request_responses rr
          WHERE ((rr.request_id = r.id) AND (rr.status = 'pending'::public.response_status))) AS pending_response_count,
    (EXISTS ( SELECT 1
           FROM public.ratings g
          WHERE ((g.request_id = r.id) AND (g.rater_id = ( SELECT auth.uid() AS uid))))) AS is_rated,
    r.created_at,
    r.updated_at,
    r.submitted_at,
    r.expires_at,
    r.accepted_at,
    r.started_at,
    r.completed_at,
    r.cancelled_at,
    received.stars AS my_rating_stars,
    received.comment AS my_rating_comment
   FROM public.requests r
   LEFT JOIN public.ratings received
     ON received.request_id = r.id
    AND received.ratee_id = r.requester_id
  WHERE (r.requester_id = ( SELECT auth.uid() AS uid));

GRANT ALL ON TABLE "public"."my_requests" TO anon;
GRANT ALL ON TABLE "public"."my_requests" TO authenticated;
GRANT ALL ON TABLE "public"."my_requests" TO service_role;
