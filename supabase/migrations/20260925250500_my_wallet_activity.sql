-- Read-only wallet history for the signed-in user (immutable ledger stays server-only for writes).

create view public.my_wallet_activity
with (security_invoker = on) as
select
  wl.id,
  wl.kind,
  wl.available_delta,
  wl.locked_delta,
  wl.pending_delta,
  wl.request_id,
  wl.created_at
from public.wallet_ledger wl
where wl.user_id = (select auth.uid());

revoke all on public.my_wallet_activity from public, anon;
grant select on public.my_wallet_activity to authenticated;
