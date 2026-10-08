-- Controlled request tags (catalogue + many-to-many). Not categories; optional on create.

CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tags_name_check CHECK (
    char_length(btrim(name)) >= 1 AND char_length(btrim(name)) <= 80
  ),
  CONSTRAINT tags_slug_check CHECK (
    char_length(btrim(slug)) >= 1
    AND char_length(btrim(slug)) <= 40
    AND btrim(slug) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

CREATE UNIQUE INDEX tags_slug_key ON public.tags (slug);

CREATE TABLE public.request_tags (
  request_id uuid NOT NULL REFERENCES public.requests (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, tag_id)
);

CREATE INDEX request_tags_tag_id_idx ON public.request_tags (tag_id);

INSERT INTO public.tags (name, slug) VALUES
  ('Electrician', 'electrician'),
  ('Carpenter', 'carpenter'),
  ('Furniture', 'furniture'),
  ('Food', 'food'),
  ('Plumbing', 'plumbing'),
  ('Moving', 'moving'),
  ('Cleaning', 'cleaning'),
  ('Gardening', 'gardening');

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tags_select_active ON public.tags
  FOR SELECT TO authenticated
  USING (is_active);

CREATE POLICY request_tags_select_parties ON public.request_tags
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.requests r
      WHERE r.id = request_tags.request_id
        AND (
          r.requester_id = (SELECT auth.uid())
          OR r.selected_user_id = (SELECT auth.uid())
        )
    )
  );

GRANT SELECT ON TABLE public.tags TO authenticated;
GRANT SELECT ON TABLE public.tags TO service_role;
GRANT SELECT ON TABLE public.request_tags TO authenticated;
GRANT SELECT ON TABLE public.request_tags TO service_role;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.request_tags FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.tags FROM authenticated;

CREATE OR REPLACE FUNCTION public.search_tags(
  p_query text DEFAULT '',
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  tag_id uuid,
  name text,
  slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    t.id,
    t.name,
    t.slug
  FROM public.tags t
  WHERE t.is_active
    AND (
      btrim(coalesce(p_query, '')) = ''
      OR t.name ILIKE '%' || btrim(p_query) || '%'
      OR t.slug ILIKE '%' || regexp_replace(btrim(p_query), '^#', '') || '%'
    )
  ORDER BY t.name ASC
  LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
$$;

GRANT ALL ON FUNCTION public.search_tags(text, integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_tags(text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.attach_tags_to_request(
  p_request_id uuid,
  p_tag_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_distinct_ids uuid[];
  v_count integer;
  v_valid integer;
BEGIN
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
  INTO v_distinct_ids
  FROM unnest(coalesce(p_tag_ids, '{}'::uuid[])) AS u(x)
  WHERE x IS NOT NULL;

  v_count := coalesce(array_length(v_distinct_ids, 1), 0);

  IF v_count > 3 THEN
    RAISE EXCEPTION 'a request may have at most 3 tags' USING errcode = '22023';
  END IF;

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

  INSERT INTO public.request_tags (request_id, tag_id)
  SELECT p_request_id, unnest(v_distinct_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.attach_tags_to_request(uuid, uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.attach_tags_to_request(uuid, uuid[]) TO service_role;

DROP FUNCTION IF EXISTS public.create_request(
  text, text, double precision, double precision, text,
  timestamp with time zone, numeric, uuid, text
);

CREATE OR REPLACE FUNCTION public.create_request(
  p_title text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_scheduled_for timestamp with time zone DEFAULT NULL,
  p_offered_amount numeric DEFAULT NULL,
  p_source_request_id uuid DEFAULT NULL,
  p_attachment_path text DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := public.assert_onboarded();
  v_location extensions.geography := public.assert_coordinates(p_latitude, p_longitude);
  v_description text := nullif(btrim(p_description), '');
  v_request_id uuid;
  v_source public.requests%rowtype;
BEGIN
  IF char_length(btrim(p_title)) < 3 OR char_length(btrim(p_title)) > 120 THEN
    RAISE EXCEPTION 'title must be between 3 and 120 characters' USING errcode = '22023';
  END IF;

  IF v_description IS NULL
     OR char_length(v_description) < 1
     OR char_length(v_description) > 1000 THEN
    RAISE EXCEPTION 'description must be between 1 and 1000 characters' USING errcode = '22023';
  END IF;

  IF p_offered_amount IS NULL OR p_offered_amount <= 0 THEN
    RAISE EXCEPTION 'offer amount must be greater than zero' USING errcode = '22023';
  END IF;

  IF p_scheduled_for IS NOT NULL AND p_scheduled_for < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'scheduled time is in the past' USING errcode = '22023';
  END IF;

  IF p_scheduled_for IS NOT NULL AND p_scheduled_for > now() + interval '30 days' THEN
    RAISE EXCEPTION 'scheduled time is too far in the future' USING errcode = '22023';
  END IF;

  IF p_attachment_path IS NOT NULL THEN
    IF split_part(p_attachment_path, '/', 1) <> v_user_id::text
       OR split_part(p_attachment_path, '/', 2) <> 'drafts' THEN
      RAISE EXCEPTION 'invalid attachment path' USING errcode = '22023';
    END IF;
  END IF;

  IF p_source_request_id IS NOT NULL THEN
    SELECT * INTO v_source
    FROM public.requests
    WHERE id = p_source_request_id AND requester_id = v_user_id;

    IF v_source.id IS NULL THEN
      RAISE EXCEPTION 'source request not found' USING errcode = 'P0002';
    END IF;

    IF NOT (
      v_source.status = 'completed'
      OR v_source.status = 'expired'
      OR (v_source.status = 'posted' AND v_source.expires_at <= now())
    ) THEN
      RAISE EXCEPTION 'only expired or completed requests can be reused' USING errcode = '55000';
    END IF;
  END IF;

  IF (
    SELECT count(*) FROM public.requests
    WHERE requester_id = v_user_id
      AND (
        status IN ('accepted', 'in_progress', 'completion_pending')
        OR (status = 'posted' AND expires_at > now())
      )
  ) >= 5 THEN
    RAISE EXCEPTION 'you already have 5 open requests' USING errcode = '55000';
  END IF;

  PERFORM public.ensure_wallet_account(v_user_id);

  INSERT INTO public.requests (
    requester_id,
    title,
    description,
    scheduled_for,
    offered_amount,
    payment_status,
    location,
    location_label,
    status,
    submitted_at,
    expires_at,
    source_request_id,
    attachment_path
  )
  VALUES (
    v_user_id,
    btrim(p_title),
    v_description,
    p_scheduled_for,
    p_offered_amount,
    'not_required'::public.payment_status,
    v_location,
    btrim(p_location_label),
    'posted',
    now(),
    public.request_expires_at(p_scheduled_for),
    p_source_request_id,
    p_attachment_path
  )
  RETURNING id INTO v_request_id;

  PERFORM public.attach_tags_to_request(v_request_id, p_tag_ids);

  PERFORM public.lock_request_escrow(v_request_id, 'create:' || v_request_id::text);

  RETURN v_request_id;
END;
$$;

GRANT ALL ON FUNCTION public.create_request(
  text, text, double precision, double precision, text,
  timestamp with time zone, numeric, uuid, text, uuid[]
) TO anon;
GRANT ALL ON FUNCTION public.create_request(
  text, text, double precision, double precision, text,
  timestamp with time zone, numeric, uuid, text, uuid[]
) TO authenticated;
GRANT ALL ON FUNCTION public.create_request(
  text, text, double precision, double precision, text,
  timestamp with time zone, numeric, uuid, text, uuid[]
) TO service_role;
