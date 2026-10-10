-- Manual request expiry: awaiting review, extend, owner expire, notifications.

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

select pg_temp.make_user('11111111-1111-1111-1111-111111111111', 'Amaka Requester', '+2348000000101') as _ \gset
select pg_temp.make_user('22222222-2222-2222-2222-222222222222', 'Near Helper', '+2348000000102') as _ \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    '11111111-1111-1111-1111-111111111111'::uuid,
    5000000,
    'test-awaiting-review-wallet',
    'test'
  )$$,
  'fund requester wallet'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Awaiting review flow',
  'Needs owner attention after the window ends.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  8000
) as review_request_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'review_request_id'::uuid,
  'I can help today.',
  null,
  6.5000,
  3.3800
) as review_response_id \gset

select pg_temp.act_as_owner() as _ \gset
update public.requests
set expires_at = now() - interval '1 minute'
where id = :'review_request_id'::uuid;

select ok(
  public.transition_request_to_awaiting_review(:'review_request_id'::uuid),
  'transition_request_to_awaiting_review closes the response window'
);

select is(
  (select status::text from public.requests where id = :'review_request_id'::uuid),
  'awaiting_review',
  'stored status becomes awaiting_review'
);

select is(
  (select count(*)::int from public.request_responses
   where request_id = :'review_request_id'::uuid and status = 'pending'),
  1,
  'pending responses remain pending in awaiting review'
);

select is(
  (select count(*)::int from public.notification_inbox
   where request_id = :'review_request_id'::uuid
     and type = 'request_awaiting_review'
     and user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  1,
  'owner receives an awaiting review notification'
);

select ok(
  not public.transition_request_to_awaiting_review(:'review_request_id'::uuid),
  'awaiting review transition does not duplicate notifications'
);

select is(
  (select count(*)::int from public.notification_inbox
   where request_id = :'review_request_id'::uuid and type = 'request_awaiting_review'),
  1,
  'notification dedupe keeps a single awaiting review inbox row'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    $$select public.extend_request(%L, now() + interval '2 days')$$,
    :'review_request_id'
  ),
  'requester can extend an awaiting review request'
);

select is(
  (select status::text from public.requests where id = :'review_request_id'::uuid),
  'posted',
  'extend reopens the request for responses'
);

select is(
  (select expires_at > now() from public.requests where id = :'review_request_id'::uuid),
  true,
  'extend updates the response deadline'
);

select pg_temp.act_as_owner() as _ \gset
update public.requests
set status = 'awaiting_review',
    expires_at = now() - interval '1 minute'
where id = :'review_request_id'::uuid;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.owner_expire_request(%L)', :'review_request_id'),
  'requester can permanently close an awaiting review request'
);

select is(
  (select status::text from public.requests where id = :'review_request_id'::uuid),
  'expired',
  'owner expire writes expired status'
);

select is(
  (select count(*)::int from public.request_responses
   where request_id = :'review_request_id'::uuid and status = 'pending'),
  1,
  'owner expire preserves pending responses for history'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Accepted engagement',
  'Should not enter awaiting review after the window ends.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  9000
) as engaged_request_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'engaged_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800
) as engaged_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select accept_response(%L)', :'engaged_response_id'),
  'accept helper before window ends'
);

select pg_temp.act_as_owner() as _ \gset
update public.requests
set expires_at = now() - interval '1 minute'
where id = :'engaged_request_id'::uuid;

select ok(
  not public.transition_request_to_awaiting_review(:'engaged_request_id'::uuid),
  'accepted engagements are excluded from awaiting review transition'
);

select is(
  (select status::text from public.requests where id = :'engaged_request_id'::uuid),
  'accepted',
  'accepted request status is unchanged when the window passes'
);

select * from finish();

rollback;
