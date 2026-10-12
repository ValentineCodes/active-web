-- Home discovery without coordinates; private saved places for posting requests.

CREATE OR REPLACE FUNCTION public.browse_open_requests()
RETURNS TABLE(
  request_id uuid,
  title text,
  description text,
  scheduled_for timestamp with time zone,
  offered_amount numeric,
  currency text,
  location_label text,
  distance_m integer,
  requester_display_name text,
  requester_avatar_path text,
  requester_rating_average numeric,
  requester_rating_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH viewer AS (
    SELECT public.assert_onboarded() AS user_id
  )
  SELECT
    r.id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    NULL::integer,
    p.display_name,
    p.avatar_path,
    p.rating_average,
    p.rating_count
  FROM viewer
  JOIN public.requests r
    ON r.status = 'posted'
   AND r.expires_at > now()
   AND r.offered_amount IS NOT NULL
   AND r.offered_amount > 0
   AND r.payment_status IN (
     'not_required'::public.payment_status,
     'locked'::public.payment_status
   )
   AND NOT EXISTS (
     SELECT 1
     FROM public.request_responses rr
     WHERE rr.request_id = r.id
       AND rr.responder_id = viewer.user_id
       AND rr.status IN (
         'pending'::public.response_status,
         'accepted'::public.response_status,
         'declined'::public.response_status
       )
   )
  JOIN public.profiles p ON p.id = r.requester_id
  ORDER BY r.created_at DESC;
$$;

GRANT ALL ON FUNCTION public.browse_open_requests() TO anon;
GRANT ALL ON FUNCTION public.browse_open_requests() TO authenticated;
GRANT ALL ON FUNCTION public.browse_open_requests() TO service_role;

CREATE TABLE public.saved_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  alias text,
  location_label text NOT NULL,
  location extensions.geography(Point, 4326) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  last_used_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT saved_locations_alias_check CHECK (
    alias IS NULL
    OR (char_length(btrim(alias)) >= 2 AND char_length(btrim(alias)) <= 40)
  ),
  CONSTRAINT saved_locations_location_label_check CHECK (
    char_length(btrim(location_label)) >= 2 AND char_length(btrim(location_label)) <= 120
  )
);

CREATE INDEX saved_locations_user_last_used_idx
  ON public.saved_locations (user_id, last_used_at DESC);

CREATE UNIQUE INDEX saved_locations_user_alias_unique
  ON public.saved_locations (user_id, lower(btrim(alias)))
  WHERE alias IS NOT NULL;

ALTER TABLE public.saved_locations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.saved_locations FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.list_my_saved_locations()
RETURNS TABLE(
  saved_location_id uuid,
  alias text,
  location_label text,
  latitude double precision,
  longitude double precision,
  is_default boolean,
  last_used_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    s.id,
    s.alias,
    s.location_label,
    extensions.st_y(s.location::extensions.geometry),
    extensions.st_x(s.location::extensions.geometry),
    s.is_default,
    s.last_used_at
  FROM public.saved_locations s
  WHERE s.user_id = public.assert_authenticated()
  ORDER BY s.is_default DESC, s.last_used_at DESC, s.created_at DESC;
$$;

GRANT ALL ON FUNCTION public.list_my_saved_locations() TO authenticated;
GRANT ALL ON FUNCTION public.list_my_saved_locations() TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_saved_location(
  p_saved_location_id uuid,
  p_alias text,
  p_location_label text,
  p_latitude double precision,
  p_longitude double precision,
  p_is_default boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_location extensions.geography := public.assert_coordinates(p_latitude, p_longitude);
  v_label text := btrim(p_location_label);
  v_alias text := nullif(btrim(p_alias), '');
  v_count integer;
  v_id uuid;
BEGIN
  IF char_length(v_label) < 2 OR char_length(v_label) > 120 THEN
    RAISE EXCEPTION 'location label must be between 2 and 120 characters' USING errcode = '22023';
  END IF;

  IF p_saved_location_id IS NULL THEN
    SELECT count(*)::integer INTO v_count
    FROM public.saved_locations
    WHERE user_id = v_user_id;

    IF v_count >= 5 THEN
      RAISE EXCEPTION 'you may save at most 5 places' USING errcode = '22023';
    END IF;

    INSERT INTO public.saved_locations (
      user_id,
      alias,
      location_label,
      location,
      is_default,
      last_used_at
    )
    VALUES (
      v_user_id,
      v_alias,
      v_label,
      v_location,
      coalesce(p_is_default, false),
      now()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.saved_locations s
    SET
      alias = v_alias,
      location_label = v_label,
      location = v_location,
      is_default = coalesce(p_is_default, s.is_default),
      last_used_at = now()
    WHERE s.id = p_saved_location_id
      AND s.user_id = v_user_id
    RETURNING s.id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'saved place not found' USING errcode = '22023';
    END IF;
  END IF;

  IF coalesce(p_is_default, false) THEN
    UPDATE public.saved_locations
    SET is_default = false
    WHERE user_id = v_user_id
      AND id <> v_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT ALL ON FUNCTION public.upsert_saved_location(
  uuid, text, text, double precision, double precision, boolean
) TO authenticated;
GRANT ALL ON FUNCTION public.upsert_saved_location(
  uuid, text, text, double precision, double precision, boolean
) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_saved_location(p_saved_location_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  DELETE FROM public.saved_locations
  WHERE id = p_saved_location_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'saved place not found' USING errcode = '22023';
  END IF;
END;
$$;

GRANT ALL ON FUNCTION public.delete_saved_location(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_saved_location(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.touch_saved_location(p_saved_location_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
BEGIN
  UPDATE public.saved_locations
  SET last_used_at = now()
  WHERE id = p_saved_location_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'saved place not found' USING errcode = '22023';
  END IF;
END;
$$;

GRANT ALL ON FUNCTION public.touch_saved_location(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.touch_saved_location(uuid) TO service_role;
