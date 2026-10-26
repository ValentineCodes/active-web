-- Pre-handshake chat: permissions, messaging, acceptance continuity, and privacy.

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

select pg_temp.make_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pre Requester', '+2348000000201') as _ \gset
select pg_temp.make_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Pre Helper A', '+2348000000202') as _ \gset
select pg_temp.make_user('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Pre Helper B', '+2348000000203') as _ \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    5000000,
    'test-seed-pre-handshake-requester',
    'test'
  )$$,
  'fund requester wallet'
);

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select create_request(
  'Pre-handshake chat test',
  'Need help moving a box',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  7500
) as pre_request_id \gset

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as _ \gset
select respond_to_request(
  :'pre_request_id',
  'I can help with that.',
  null,
  6.5000,
  3.3800
) as pre_response_a_id \gset

select pg_temp.act_as('cccccccc-cccc-cccc-cccc-cccccccccccc') as _ \gset
select respond_to_request(
  :'pre_request_id',
  'Available too.',
  null,
  6.5000,
  3.3800
) as pre_response_b_id \gset

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as _ \gset
select throws_ok(
  format($$select public.open_pre_handshake_conversation(%L::uuid)$$, :'pre_response_a_id'),
  '42501',
  'only the request owner can start a discussion',
  'responders cannot open pre-handshake chat'
);

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select public.open_pre_handshake_conversation(:'pre_response_a_id'::uuid) as pre_conversation_a_id \gset
select public.open_pre_handshake_conversation(:'pre_response_b_id'::uuid) as pre_conversation_b_id \gset

select is(
  (select count(*)::integer from public.handshakes where request_id = :'pre_request_id'::uuid),
  0,
  'opening chat does not create a handshake'
);

select is(
  (select payment_status from public.requests where id = :'pre_request_id'::uuid),
  'not_required'::public.payment_status,
  'opening chat does not lock wallet funds'
);

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as _ \gset
select throws_ok(
  format($$select public.send_request_message(%L, %L)$$, :'pre_conversation_a_id', 'Happy to help'),
  '55000',
  'this conversation is read-only',
  'responder cannot message before the requester sends first'
);

select is(
  public.get_responder_pre_handshake_conversation(:'pre_request_id'::uuid),
  null,
  'responder discuss entry stays hidden until the requester has messaged'
);

select pg_temp.act_as_owner() as _ \gset
update public.profiles
set avatar_path = null,
    avatar_captured_in_app = false
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select throws_ok(
  format($$select public.send_request_message(%L, %L)$$, :'pre_conversation_a_id', 'Hi'),
  '55000',
  'add a profile photo in the app before messaging',
  'messaging requires an in-app profile photo'
);

select pg_temp.act_as_owner() as _ \gset
update public.profiles
set avatar_path = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/avatar.jpg',
    avatar_captured_in_app = true
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select lives_ok(
  format($$select public.send_request_message(%L, %L)$$, :'pre_conversation_a_id', 'Hi, are you free Saturday?'),
  'requester can send the first message'
);

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as _ \gset
select is(
  public.get_responder_pre_handshake_conversation(:'pre_request_id'::uuid)::text,
  :'pre_conversation_a_id',
  'responder sees discuss after the requester has messaged'
);

select lives_ok(
  format($$select public.send_request_message(%L, %L)$$, :'pre_conversation_a_id', 'Happy to help'),
  'responder can reply after the requester message'
);

select pg_temp.act_as('cccccccc-cccc-cccc-cccc-cccccccccccc') as _ \gset
select is(
  (select count(*) from public.resolve_request_conversation_for_viewer(:'pre_conversation_a_id'::uuid)),
  0::bigint,
  'other responders cannot read a private pre-handshake chat'
);

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select lives_ok(
  format($$select public.accept_response(%L::uuid)$$, :'pre_response_a_id'),
  'accept continues through existing selection flow'
);

select is(
  (
    select count(*)
    from public.request_messages m
    where m.conversation_id = :'pre_conversation_a_id'::uuid
      and m.body = 'Happy to help'
  ),
  1::bigint,
  'acceptance keeps pre-handshake messages in the same conversation'
);

select is(
  (
    select messaging_enabled
    from public.resolve_request_conversation_for_viewer(:'pre_conversation_a_id'::uuid)
  ),
  true,
  'selected helper conversation stays open after acceptance'
);

select is(
  (
    select messaging_enabled
    from public.resolve_request_conversation_for_viewer(:'pre_conversation_b_id'::uuid)
  ),
  false,
  'unselected helper pre-handshake chat becomes read-only'
);

select pg_temp.act_as('cccccccc-cccc-cccc-cccc-cccccccccccc') as _ \gset
select throws_ok(
  format($$select public.send_request_message(%L, %L)$$, :'pre_conversation_b_id', 'Still here'),
  '55000',
  'this conversation is read-only',
  'unselected responder cannot send after selection'
);

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as _ \gset
select isnt(
  (select counterparty_phone from public.get_engagement(:'pre_request_id'::uuid)),
  null,
  'engagement exposes phone only after acceptance'
);

select finish();

rollback;
