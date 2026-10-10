-- Enum values must be committed before use in functions (separate migration).

ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'awaiting_review';

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'request_awaiting_review';
