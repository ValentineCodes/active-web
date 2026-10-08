-- Display tag catalogue names on read paths (column remains tag_slugs for API stability).

CREATE OR REPLACE FUNCTION public.request_tag_slugs(p_request_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT coalesce(
    array_agg(t.name ORDER BY t.name),
    '{}'::text[]
  )
  FROM (
    SELECT tg.name
    FROM public.request_tags rt
    JOIN public.tags tg ON tg.id = rt.tag_id AND tg.is_active
    WHERE rt.request_id = p_request_id
    ORDER BY tg.name
    LIMIT 3
  ) t;
$$;
