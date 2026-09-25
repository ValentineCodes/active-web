-- Provider selection push: exact product copy for the handshake moment.

create or replace function public.notify_provider_of_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_name text;
begin
  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = new.requester_id;

  perform public.send_push(
    array[new.provider_id],
    'You''ve been selected!',
    format('%s chose you. Open the job for their exact location and phone number.', v_requester_name),
    format('/engagement/%s', new.id)
  );

  return new;
end;
$$;
