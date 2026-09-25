-- Requester cannot cancel while waiting to confirm (or dispute) provider completion.

create or replace function public.cancel_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_requester_id uuid;
  v_status public.request_status;
begin
  select r.requester_id, r.status
    into v_requester_id, v_status
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_requester_id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_requester_id <> v_user_id then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'completion_pending' then
    raise exception 'you cannot cancel while completion is being confirmed'
      using errcode = '55000';
  end if;

  perform public.finalize_request_cancellation(
    p_request_id,
    v_user_id,
    'cancel_request:' || p_request_id::text,
    'cancel:' || p_request_id::text
  );
end;
$$;
