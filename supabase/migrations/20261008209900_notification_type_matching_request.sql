-- Enum values must be committed before use in functions (PostgreSQL 55P04).

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'matching_request';
