-- Request proposed delivery duration: maximum 30 days (authoritative seconds).

CREATE OR REPLACE FUNCTION public.request_engagement_max_delivery_interval()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT interval '30 days';
$$;

CREATE OR REPLACE FUNCTION public.request_engagement_max_delivery_seconds()
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT 30::bigint * 86400;
$$;

CREATE OR REPLACE FUNCTION public.assert_valid_proposed_delivery_duration(
  p_value integer,
  p_unit public.delivery_duration_unit
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
DECLARE
  v_seconds bigint;
BEGIN
  IF p_value IS NULL OR p_value < 1 THEN
    RAISE EXCEPTION 'delivery duration must be a positive whole number' USING errcode = '22023';
  END IF;

  IF p_unit IS NULL THEN
    RAISE EXCEPTION 'delivery duration unit is required' USING errcode = '22023';
  END IF;

  v_seconds := public.delivery_duration_to_seconds(p_value, p_unit);

  IF v_seconds < 60 THEN
    RAISE EXCEPTION 'delivery duration must be at least one minute' USING errcode = '55000';
  END IF;

  IF v_seconds > public.request_engagement_max_delivery_seconds() THEN
    RAISE EXCEPTION 'delivery duration exceeds the maximum of 30 days' USING errcode = '55000';
  END IF;

  RETURN v_seconds;
END;
$$;