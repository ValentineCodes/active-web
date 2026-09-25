-- Handshake participants can read status events after cancellation clears provider_id.

drop policy if exists request_status_events_select_participant on public.request_status_events;

create policy request_status_events_select_participant
  on public.request_status_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.requests r
      where r.id = request_id
        and (
          r.requester_id = (select auth.uid())
          or r.provider_id = (select auth.uid())
        )
    )
    or exists (
      select 1
      from public.handshakes h
      where h.request_id = request_id
        and h.provider_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.handshakes h
      where h.request_id = request_id
        and h.requester_id = (select auth.uid())
    )
  );
