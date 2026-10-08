-- Document request.description as the requester-stated expected outcome.
-- Legacy rows with NULL/blank descriptions were backfilled in 20261008153000_required_request_description
-- using the request title so historical requests remain readable without duplicating data elsewhere.

COMMENT ON COLUMN public.requests.description IS
  'Requester-stated expected outcome (required on create). Legacy requests missing a description were backfilled from title.';
