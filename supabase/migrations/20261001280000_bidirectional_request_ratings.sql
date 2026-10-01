-- Each party can rate the other once per completed request.

ALTER TABLE ONLY "public"."ratings"
  DROP CONSTRAINT IF EXISTS "ratings_request_id_key";

ALTER TABLE ONLY "public"."ratings"
  ADD CONSTRAINT "ratings_request_id_rater_id_key" UNIQUE ("request_id", "rater_id");

CREATE OR REPLACE FUNCTION "public"."rate_request"(
  "p_request_id" "uuid",
  "p_stars" smallint,
  "p_comment" "text" DEFAULT NULL::"text"
) RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_requester_id uuid;
  v_provider_id uuid;
  v_ratee_id uuid;
begin
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'stars must be between 1 and 5' using errcode = '22023';
  end if;

  if p_comment is not null and char_length(btrim(p_comment)) > 500 then
    raise exception 'comment must be 500 characters or fewer' using errcode = '22023';
  end if;

  select r.requester_id, r.selected_user_id
    into v_requester_id, v_provider_id
  from public.requests r
  where r.id = p_request_id
    and r.status = 'completed'::public.request_status
    and v_user_id in (r.requester_id, r.selected_user_id);

  if v_requester_id is null then
    raise exception 'only a completed request can be rated' using errcode = '55000';
  end if;

  if v_user_id = v_requester_id then
    v_ratee_id := v_provider_id;
  else
    v_ratee_id := v_requester_id;
  end if;

  if v_ratee_id is null then
    raise exception 'only a completed request can be rated' using errcode = '55000';
  end if;

  insert into public.ratings (request_id, rater_id, ratee_id, stars, comment)
  values (
    p_request_id,
    v_user_id,
    v_ratee_id,
    p_stars,
    nullif(btrim(p_comment), '')
  );
end;
$$;

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
    rating.stars,
    rating.comment,
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
  LEFT JOIN public.ratings rating
    ON rating.request_id = r.id
   AND rating.rater_id = me.user_id
  LEFT JOIN public.handshakes h ON h.request_id = r.id;
$$;

GRANT ALL ON FUNCTION public.get_engagement(uuid) TO anon;
GRANT ALL ON FUNCTION public.get_engagement(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_engagement(uuid) TO service_role;

CREATE OR REPLACE VIEW "public"."my_requests" WITH ("security_invoker"='on') AS
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
    my_rating.stars AS my_rating_stars,
    my_rating.comment AS my_rating_comment
   FROM public.requests r
   LEFT JOIN public.ratings my_rating
     ON my_rating.request_id = r.id
    AND my_rating.rater_id = r.requester_id
  WHERE (r.requester_id = ( SELECT auth.uid() AS uid));
