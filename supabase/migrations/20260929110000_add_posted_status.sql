-- New lifecycle label for open requests (replaces `searching` in product language).
alter type public.request_status add value if not exists 'posted';
