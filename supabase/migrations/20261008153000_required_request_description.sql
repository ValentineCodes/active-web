-- Request descriptions are required: they state the requester's expected outcome.

ALTER TABLE public.requests DISABLE TRIGGER requests_guard_history_immutable;

UPDATE public.requests
SET description = btrim(title)
WHERE description IS NULL OR btrim(description) = '';

ALTER TABLE public.requests ENABLE TRIGGER requests_guard_history_immutable;

ALTER TABLE public.requests
  DROP CONSTRAINT IF EXISTS requests_description_length;

ALTER TABLE public.requests
  ALTER COLUMN description SET NOT NULL;

ALTER TABLE public.requests
  ADD CONSTRAINT requests_description_length CHECK (
    char_length(btrim(description)) >= 1
    AND char_length(btrim(description)) <= 1000
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
  p_attachment_path text DEFAULT NULL
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

  PERFORM public.lock_request_escrow(v_request_id, 'create:' || v_request_id::text);

  RETURN v_request_id;
END;
$$;
