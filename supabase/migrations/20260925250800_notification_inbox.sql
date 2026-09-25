-- In-app notification center: every send_push delivery is stored per user so the
-- Notifications tab works even when system push is off or no device is registered.

create table public.notification_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(body) <= 500),
  url text check (url is null or char_length(url) <= 200),
  created_at timestamptz not null default now()
);

create index notification_inbox_user_created_idx
  on public.notification_inbox (user_id, created_at desc);

alter table public.notification_inbox enable row level security;

create policy notification_inbox_select_own
  on public.notification_inbox
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.notification_inbox from public, anon;
grant select on public.notification_inbox to authenticated;

create or replace function public.send_push(
  p_user_ids uuid[],
  p_title text,
  p_body text,
  p_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages jsonb;
begin
  if coalesce(array_length(p_user_ids, 1), 0) = 0 then
    return;
  end if;

  insert into public.notification_inbox (user_id, title, body, url)
  select distinct uid, p_title, p_body, p_url
  from unnest(p_user_ids) as uid;

  -- Expo accepts up to 100 messages per call. Beyond that this needs chunking, which
  -- the MVP's volumes do not reach.
  select jsonb_agg(
           jsonb_build_object(
             'to', t.token,
             'title', p_title,
             'body', p_body,
             'sound', 'default',
             'data', jsonb_build_object('url', p_url)
           )
         )
    into v_messages
  from public.push_tokens t
  where t.user_id = any (p_user_ids);

  if v_messages is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_messages
  );
end;
$$;

revoke execute on function public.send_push(uuid[], text, text, text) from public, anon, authenticated;
