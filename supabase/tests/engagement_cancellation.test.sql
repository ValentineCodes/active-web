-- Engagement cancellation policy: provider immediate, client consent, auto-expire, fallback selection.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

create function pg_temp.make_user(p_id uuid, p_name text, p_phone text)
returns text
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, phone, phone_confirmed_at, created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    p_id, 'authenticated', 'authenticated', p_phone, now(), now(), now()
  );

  update public.profiles
  set display_name = p_name,
      avatar_path = p_id::text || '/avatar.jpg',
      avatar_captured_in_app = true
  where id = p_id;

  return p_name;
end;
$$;

create function pg_temp.act_as(p_id uuid)
returns text
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
  return p_id::text;
end;
$$;

create function pg_temp.act_as_owner()
returns text
language plpgsql
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return 'postgres';
end;
$$;

select pg_temp.make_user('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Cancel Requester', '+2348000000201') as _ \gset
select pg_temp.make_user('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Cancel Helper A', '+2348000000202') as _ \gset
select pg_temp.make_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Cancel Helper B', '+2348000000203') as _ \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    2000000,
    'eng-cancel-requester-seed',
    'eng-cancel-seed'
  )$$,
  'seed requester wallet'
);

select pg_temp.act_as('cccccccc-cccc-cccc-cccc-cccccccccccc') as _ \gset
select create_request(
  'Engagement cancel fixture',
  'Need help moving a couch.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as eng_cancel_request_id \gset

select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd') as _ \gset
select respond_to_request(
  :'eng_cancel_request_id'::uuid,
  'I can help today',
  null,
  6.5000,
  3.3800
) as eng_cancel_response_a \gset

select pg_temp.act_as('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') as _ \gset
select respond_to_request(
  :'eng_cancel_request_id'::uuid,
  'Available too',
  null,
  6.5400,
  3.3800
) as eng_cancel_response_b \gset

select pg_temp.act_as('cccccccc-cccc-cccc-cccc-cccccccccccc') as _ \gset
select lives_ok(
  format('select accept_response(%L)', :'eng_cancel_response_a'),
  'accept helper A'
);

select is(
  (
    select count(*)::int
    from public.request_responses rr
    where rr.request_id = :'eng_cancel_request_id'::uuid
      and rr.status = 'pending'
  ),
  1,
  'non-selected response stays pending at accept'
);

select is(
  (select count(*) from list_request_responses(:'eng_cancel_request_id'::uuid)),
  2::bigint,
  'requester can list accepted and pending alternatives during engagement'
);

-- Client cancel creates pending request; funds stay locked --------------------------------

select lives_ok(
  format(
    $$select request_engagement_cancellation(%L::uuid, %L)$$,
    :'eng_cancel_request_id',
    'Changed my plans'
  ),
  'requester opens cancellation request'
);

select is(
  (
    select status::text
    from public.requests
    where id = :'eng_cancel_request_id'::uuid
  ),
  'accepted',
  'engagement stays active while cancellation is pending'
);

select is(
  (
    select payment_status::text
    from public.requests
    where id = :'eng_cancel_request_id'::uuid
  ),
  'pending',
  'funds stay pending while cancellation awaits provider'
);

select is(
  (
    select available_balance
    from public.wallets
    where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
  ),
  1500000::bigint,
  'wallet not refunded until cancellation settles'
);

select throws_ok(
  format('select mark_service_complete(%L)', :'eng_cancel_request_id'),
  '55000',
  null,
  'provider cannot mark done while cancellation is pending'
);

-- Provider decline keeps engagement active -------------------------------------------------

select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd') as _ \gset
select lives_ok(
  format(
    $$select respond_engagement_cancellation(%L::uuid, false, %L)$$,
    :'eng_cancel_request_id',
    'I already started'
  ),
  'provider declines cancellation'
);

select is(
  (
    select status::text
    from public.engagement_cancellation_requests
    where request_id = :'eng_cancel_request_id'::uuid
    order by created_at desc
    limit 1
  ),
  'declined',
  'cancellation request closed as declined'
);

select is(
  (
    select status::text
    from public.requests
    where id = :'eng_cancel_request_id'::uuid
  ),
  'accepted',
  'engagement remains accepted after provider decline'
);

-- Second client cancellation + provider agree + refund ------------------------------------

select pg_temp.act_as('cccccccc-cccc-cccc-cccc-cccccccccccc') as _ \gset
select lives_ok(
  format(
    $$select request_engagement_cancellation(%L::uuid, %L)$$,
    :'eng_cancel_request_id',
    'Still need to cancel'
  ),
  'requester opens second cancellation request'
);

select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd') as _ \gset
select lives_ok(
  format(
    $$select respond_engagement_cancellation(%L::uuid, true, null)$$,
    :'eng_cancel_request_id'
  ),
  'provider agrees to cancellation'
);

select is(
  (
    select status::text
    from public.requests
    where id = :'eng_cancel_request_id'::uuid
  ),
  'posted',
  'request reopens for selection after agreed cancellation'
);

select is(
  (
    select payment_status::text
    from public.requests
    where id = :'eng_cancel_request_id'::uuid
  ),
  'not_required',
  'payment reset for re-selection after refund'
);

select is(
  (
    select available_balance
    from public.wallets
    where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
  ),
  2000000::bigint,
  'wallet refunded after agreed cancellation'
);

select is(
  (
    select count(*)::int
    from public.request_responses rr
    where rr.request_id = :'eng_cancel_request_id'::uuid
      and rr.status = 'pending'
  ),
  1,
  'alternative response still pending after cancellation'
);

-- Fallback selection after provider immediate cancel on a fresh engagement ----------------

select pg_temp.act_as('cccccccc-cccc-cccc-cccc-cccccccccccc') as _ \gset
select lives_ok(
  format('select accept_response(%L)', :'eng_cancel_response_b'),
  'select helper B after fallback reopen'
);

select pg_temp.act_as('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') as _ \gset
select lives_ok(
  format(
    $$select cancel_engagement_as_provider(%L::uuid, %L)$$,
    :'eng_cancel_request_id',
    'Emergency'
  ),
  'provider B cancels immediately'
);

select is(
  (
    select count(*)::int
    from public.wallet_transactions wt
    where wt.request_id = :'eng_cancel_request_id'::uuid
      and wt.type = 'refund'::public.wallet_transaction_type
  ),
  2,
  'two refund ledger entries across two engagement cycles'
);

select pg_temp.act_as('cccccccc-cccc-cccc-cccc-cccccccccccc') as _ \gset
select create_request(
  'Auto expire cancel',
  'Another couch move.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  4000
) as auto_expire_request_id \gset

select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd') as _ \gset
select respond_to_request(
  :'auto_expire_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800
) as auto_expire_response_id \gset

select pg_temp.act_as('cccccccc-cccc-cccc-cccc-cccccccccccc') as _ \gset
select accept_response(:'auto_expire_response_id'::uuid);

select request_engagement_cancellation(
  :'auto_expire_request_id'::uuid,
  'Please cancel'
) as auto_expire_cancel_id \gset

select pg_temp.act_as_owner() as _ \gset
update public.engagement_cancellation_requests
set respond_by = now() - interval '1 minute'
where id = :'auto_expire_cancel_id'::uuid;

select is(
  public.expire_due_engagement_cancellation_requests(10),
  1,
  'expire job settles overdue cancellation requests'
);

select is(
  (
    select status::text
    from public.requests
    where id = :'auto_expire_request_id'::uuid
  ),
  'posted',
  'auto-expired cancellation reopens the request'
);

select * from finish();

rollback;
