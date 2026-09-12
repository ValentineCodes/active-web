-- Active: foundations.
-- PostGIS lives in `extensions` so the generated `public` types stay clean.

create extension if not exists postgis with schema extensions;

-- Request lifecycle.
--
-- The product lifecycle is Draft -> Submitted -> Searching -> Responses -> Accepted
-- -> In Progress -> Completed. "Submitted" and "Responses" are moments, not states a
-- request rests in: submission is captured by requests.submitted_at, and "has responses"
-- is derived from the response count while the request is still `searching`.
create type public.request_status as enum (
  'draft',
  'searching',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
  'expired'
);

create type public.response_status as enum (
  'pending',
  'accepted',
  'declined',
  'withdrawn',
  'expired'
);

-- A provider is `busy` once one of their responses is accepted, and stops being matched
-- to new requests until that engagement finishes. This prevents double-booking, which is
-- the safer default while there is no scheduling system.
create type public.availability_status as enum ('offline', 'available', 'busy');
