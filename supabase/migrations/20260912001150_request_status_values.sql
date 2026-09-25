-- New request/service phases (must be committed before use in constraints/functions).
alter type public.request_status add value if not exists 'completion_pending';
alter type public.request_status add value if not exists 'disputed';
alter type public.request_status add value if not exists 'no_show';
