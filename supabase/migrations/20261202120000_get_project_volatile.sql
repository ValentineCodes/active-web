-- get_project calls evaluate_project_funding_status (FOR UPDATE). STABLE runs in a read-only
-- transaction via PostgREST, which rejects SELECT FOR UPDATE.

ALTER FUNCTION public.get_project(uuid) VOLATILE;