-- New dispute reasons (separate migration: enum values cannot be used in the same transaction).

alter type public.service_problem_kind add value if not exists 'service_not_completed';
alter type public.service_problem_kind add value if not exists 'service_differs_from_request';
alter type public.service_problem_kind add value if not exists 'other';
