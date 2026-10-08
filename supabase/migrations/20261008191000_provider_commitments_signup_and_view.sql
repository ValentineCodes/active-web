-- Provider commitments: attendance rows are created on selection only (per request).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, phone)
  VALUES (NEW.id, NEW.phone)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.wallets (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP VIEW IF EXISTS public.my_attendance;

CREATE VIEW public.my_attendance WITH (security_invoker = on) AS
SELECT
  ua.user_id,
  (
    SELECT ua2.request_id
    FROM public.user_attendance ua2
    JOIN public.requests r2 ON r2.id = ua2.request_id
    WHERE ua2.user_id = ua.user_id
    ORDER BY
      CASE
        WHEN r2.status = 'in_progress' THEN 0
        WHEN r2.status = 'completion_pending' THEN 1
        WHEN r2.status = 'accepted' THEN 2
        ELSE 3
      END,
      public.request_schedule_anchor(r2.scheduled_for, r2.accepted_at) ASC NULLS LAST,
      ua2.updated_at DESC
    LIMIT 1
  ) AS attending_request_id,
  count(*)::integer AS commitment_count,
  max(ua.updated_at) AS updated_at
FROM public.user_attendance ua
WHERE ua.user_id = (SELECT auth.uid() AS uid)
GROUP BY ua.user_id;

GRANT ALL ON TABLE public.my_attendance TO anon;
GRANT ALL ON TABLE public.my_attendance TO authenticated;
GRANT ALL ON TABLE public.my_attendance TO service_role;

GRANT ALL ON FUNCTION public.clear_user_attendance(uuid, uuid) TO anon;
GRANT ALL ON FUNCTION public.clear_user_attendance(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.clear_user_attendance(uuid, uuid) TO service_role;
