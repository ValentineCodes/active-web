-- Admin investigation overlay for service_problems (user-facing Report flow).

ALTER TYPE public.admin_audit_entity_type ADD VALUE IF NOT EXISTS 'service_problem';

CREATE TYPE public.service_problem_investigation_status AS ENUM (
  'triage',
  'under_review',
  'awaiting_info',
  'escalated'
);

COMMENT ON TYPE public.service_problem_investigation_status IS
  'Dashboard-only queue status. Does not change service_problems.status (open|resolved) or request lifecycle.';

CREATE TABLE public.service_problem_investigations (
  service_problem_id uuid PRIMARY KEY
    REFERENCES public.service_problems (id) ON DELETE CASCADE,
  assigned_admin_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  queue_status public.service_problem_investigation_status NOT NULL DEFAULT 'triage',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX service_problem_investigations_assignee_idx
  ON public.service_problem_investigations (assigned_admin_id, updated_at DESC);

CREATE TABLE public.admin_service_problem_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_problem_id uuid NOT NULL
    REFERENCES public.service_problems (id) ON DELETE CASCADE,
  author_admin_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_service_problem_notes_body_check CHECK (char_length(btrim(body)) >= 3)
);

CREATE INDEX admin_service_problem_notes_problem_idx
  ON public.admin_service_problem_notes (service_problem_id, created_at DESC);

ALTER TABLE public.service_problem_investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_service_problem_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.service_problem_investigations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.admin_service_problem_notes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.service_problem_investigations TO service_role;
GRANT ALL ON TABLE public.admin_service_problem_notes TO service_role;

CREATE OR REPLACE FUNCTION public.admin_upsert_service_problem_investigation(
  p_service_problem_id uuid,
  p_assigned_admin_id uuid,
  p_queue_status public.service_problem_investigation_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authorized' USING errcode = '42501';
  END IF;

  INSERT INTO public.service_problem_investigations (
    service_problem_id,
    assigned_admin_id,
    queue_status,
    updated_at,
    updated_by
  )
  VALUES (
    p_service_problem_id,
    p_assigned_admin_id,
    p_queue_status,
    now(),
    v_actor
  )
  ON CONFLICT (service_problem_id) DO UPDATE
  SET
    assigned_admin_id = EXCLUDED.assigned_admin_id,
    queue_status = EXCLUDED.queue_status,
    updated_at = now(),
    updated_by = v_actor;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_service_problem_investigation(uuid, uuid, public.service_problem_investigation_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_service_problem_investigation(uuid, uuid, public.service_problem_investigation_status) TO service_role;

CREATE OR REPLACE FUNCTION public.can_read_request_media(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    (storage.foldername(p_name))[1] = (SELECT auth.uid())::text
    OR public.request_media_visible_to_party((SELECT auth.uid()), p_name)
    OR (
      coalesce((public.get_my_admin_permissions()->>'reports')::boolean, false)
      AND EXISTS (
        SELECT 1
        FROM public.service_problems sp
        WHERE p_name = ANY (sp.evidence_paths)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_request_media(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_request_media(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_request_media(text) TO service_role;
