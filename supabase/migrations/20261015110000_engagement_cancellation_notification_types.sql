-- Enum values must be committed before use in functions (separate migration).

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'engagement_cancellation_requested';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'engagement_cancellation_declined';
