-- Payment transition notify still selected the dropped requests.provider_id column.

create or replace function public.notify_payment_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_id uuid;
  v_total numeric;
  v_currency text;
begin
  select r.requester_id, r.currency
    into v_requester_id, v_currency
  from public.requests r
  where r.id = new.request_id;

  select re.total into v_total
  from public.request_escrow re
  where re.request_id = new.request_id;

  if new.to_status = 'locked'::public.payment_status
     and new.idempotency_key like 'create:%' then
    perform public.send_push(
      array[v_requester_id],
      'Request funded',
      coalesce(
        format('We secured %s %s for this job in your wallet.', v_total, v_currency),
        'Your payment is secured for this job.'
      ),
      format('/request/%s', new.request_id)
    );
  elsif new.to_status = 'refunded'::public.payment_status then
    perform public.send_push(
      array[v_requester_id],
      'Refund issued',
      coalesce(
        format('%s %s was returned to your wallet.', v_total, v_currency),
        'Your payment was returned to your wallet.'
      ),
      '/wallet'
    );
  end if;

  return new;
end;
$$;
