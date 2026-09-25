-- Remove the nine-argument overload left when request_reuse added p_source_request_id.

drop function if exists public.create_request(
  text, text, double precision, double precision, text, integer, timestamptz, numeric, jsonb
);
