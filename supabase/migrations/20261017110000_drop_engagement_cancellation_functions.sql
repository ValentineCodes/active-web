-- Drop engagement-cancellation RPCs and helpers. Audit tables and enum values are kept.

DROP FUNCTION IF EXISTS public.cancel_engagement_as_provider(uuid, text);
DROP FUNCTION IF EXISTS public.request_engagement_cancellation(uuid, text);
DROP FUNCTION IF EXISTS public.respond_engagement_cancellation(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.get_engagement_cancellation(uuid);
DROP FUNCTION IF EXISTS public.list_engagement_cancellation_events(uuid);
DROP FUNCTION IF EXISTS public.expire_due_engagement_cancellation_requests(integer);

DROP FUNCTION IF EXISTS public.finalize_engagement_cancellation(
  uuid,
  uuid,
  text,
  text,
  public.engagement_cancellation_event_kind,
  text,
  uuid
);

DROP FUNCTION IF EXISTS public.assert_engagement_cancellable(uuid);
DROP FUNCTION IF EXISTS public.record_engagement_cancellation_event(
  uuid,
  uuid,
  uuid,
  public.engagement_cancellation_event_kind,
  text,
  text
);
DROP FUNCTION IF EXISTS public.normalize_engagement_cancellation_reason(text);
DROP FUNCTION IF EXISTS public.engagement_cancellation_interval();
