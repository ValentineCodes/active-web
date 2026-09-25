-- Unread badge: tab count is unread only; opening the inbox marks everything read.

alter table public.notification_inbox
  add column read_at timestamptz;

create index notification_inbox_user_unread_idx
  on public.notification_inbox (user_id)
  where read_at is null;

create or replace function public.mark_notification_inbox_read()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
begin
  update public.notification_inbox
  set read_at = now()
  where user_id = v_user_id
    and read_at is null;
end;
$$;

revoke all on function public.mark_notification_inbox_read() from public, anon;
grant execute on function public.mark_notification_inbox_read() to authenticated;
