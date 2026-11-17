-- One create_request overload: optional milestone params default to single-payment behaviour.

DROP FUNCTION IF EXISTS public.create_request(
  text,
  text,
  double precision,
  double precision,
  text,
  timestamp with time zone,
  numeric,
  uuid,
  text,
  uuid[]
);