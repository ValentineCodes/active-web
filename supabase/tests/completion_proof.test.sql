-- Completion proof chat messages and client_send_id idempotency.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

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

select pg_temp.make_user('d1111111-1111-1111-1111-111111111111', 'Proof Requester', '+2348000000901') as _ \gset
select pg_temp.make_user('d2222222-2222-2222-2222-222222222222', 'Proof Helper', '+2348000000902') as _ \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'd1111111-1111-1111-1111-111111111111'::uuid,
    5000000,
    'test-seed-completion-proof-requester',
    'test'
  )$$,
  'fund requester wallet for completion proof test'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Completion proof test',
  'Need a photo when done',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as proof_request_id \gset

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'proof_request_id'::uuid,
  'I can help',
  5000,
  6.5000,
  3.3800
) as proof_response_id \gset

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select accept_response(:'proof_response_id'::uuid) as _ \gset

select conversation_id as proof_conversation_id
from public.get_request_conversation(:'proof_request_id'::uuid)
limit 1 \gset

select gen_random_uuid() as proof_client_send_id \gset

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select message_id, attachment_id, storage_path
from public.begin_request_message_with_attachments(
  :'proof_conversation_id'::uuid,
  'I''m done',
  jsonb_build_array(
    jsonb_build_object(
      'file_name', 'proof.jpg',
      'mime_type', 'image/jpeg',
      'file_size', 2048,
      'attachment_type', 'image'
    )
  ),
  :'proof_client_send_id'::uuid
)
limit 1 \gset

select message_id as proof_inflight_retry_message_id
from public.begin_request_message_with_attachments(
  :'proof_conversation_id'::uuid,
  'I''m done',
  jsonb_build_array(
    jsonb_build_object(
      'file_name', 'proof.jpg',
      'mime_type', 'image/jpeg',
      'file_size', 2048,
      'attachment_type', 'image'
    )
  ),
  :'proof_client_send_id'::uuid
)
limit 1 \gset

select is(
  :'proof_inflight_retry_message_id'::text,
  :'message_id'::text,
  'in-flight begin retry with the same client_send_id returns the same message'
);

select is(
  (
    select count(*)::bigint
    from public.request_messages m
    where m.conversation_id = :'proof_conversation_id'::uuid
      and m.metadata @> jsonb_build_object('client_send_id', :'proof_client_send_id'::text)
  ),
  1::bigint,
  'in-flight begin retry does not create duplicate proof messages'
);

select pg_temp.act_as_owner() as _ \gset
insert into storage.objects (bucket_id, name, owner, metadata)
values (
  'conversation-media',
  :'storage_path',
  'd2222222-2222-2222-2222-222222222222'::uuid,
  jsonb_build_object('mimetype', 'image/jpeg', 'name', 'proof.jpg', 'size', 2048)
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format(
    $$select public.complete_request_message_with_attachments(%L::uuid)$$,
    :'message_id'
  ),
  'helper can publish completion proof attachment message'
);

select is(
  (
    select m.body
    from public.request_messages m
    where m.id = :'message_id'::uuid
  ),
  'I''m done',
  'completion proof message stores the exact caption'
);

select is(
  (
    select count(*)::bigint
    from public.request_messages m
    where m.conversation_id = :'proof_conversation_id'::uuid
      and m.metadata @> jsonb_build_object('client_send_id', :'proof_client_send_id'::text)
  ),
  1::bigint,
  'client_send_id reserves a single message row'
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select mark_service_complete(%L)', :'proof_request_id'),
  'sending proof does not replace mark_service_complete'
);

select is(
  (select status::text from public.requests where id = :'proof_request_id'::uuid),
  'completion_pending',
  'mark_service_complete still moves the request to completion_pending'
);

select is(
  (select payment_status::text from public.requests where id = :'proof_request_id'::uuid),
  'pending',
  'completion proof and mark_service_complete do not release escrow'
);

select * from finish();

rollback;
