-- Profile / notification interests: at most 5 tags per user.

DELETE FROM public.user_notification_tag_interests u
USING (
  SELECT ranked.user_id, ranked.tag_id
  FROM (
    SELECT
      i.user_id,
      i.tag_id,
      row_number() OVER (PARTITION BY i.user_id ORDER BY t.name ASC, i.tag_id) AS rn
    FROM public.user_notification_tag_interests i
    JOIN public.tags t ON t.id = i.tag_id
  ) ranked
  WHERE ranked.rn > 5
) excess
WHERE u.user_id = excess.user_id
  AND u.tag_id = excess.tag_id;

CREATE OR REPLACE FUNCTION public.set_notification_tag_interests(p_tag_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_authenticated();
  v_distinct_ids uuid[];
  v_count integer;
  v_valid integer;
BEGIN
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
  INTO v_distinct_ids
  FROM unnest(coalesce(p_tag_ids, '{}'::uuid[])) AS u(x)
  WHERE x IS NOT NULL;

  v_count := coalesce(array_length(v_distinct_ids, 1), 0);

  IF v_count > 5 THEN
    RAISE EXCEPTION 'you may select at most 5 profile interests' USING errcode = '22023';
  END IF;

  DELETE FROM public.user_notification_tag_interests
  WHERE user_id = v_user_id;

  IF v_count = 0 THEN
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO v_valid
  FROM public.tags t
  WHERE t.id = ANY (v_distinct_ids)
    AND t.is_active;

  IF v_valid <> v_count THEN
    RAISE EXCEPTION 'one or more tags are invalid or inactive' USING errcode = '22023';
  END IF;

  INSERT INTO public.user_notification_tag_interests (user_id, tag_id)
  SELECT v_user_id, unnest(v_distinct_ids);
END;
$$;
