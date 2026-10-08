-- Core marketplace rules: public discovery, responses, selection, attendance, and privacy.

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- Fixtures --------------------------------------------------------------------------
--
-- Coordinates around Yaba, Lagos (~1.1 km per 0.01° latitude):
--   6.5000  -> request site
--   6.5400  -> ~4.4 km (inside 50 km discovery)
--   7.5000  -> ~110 km (outside 50 km discovery)

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

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    '11111111-1111-1111-1111-111111111111'::uuid,
    5000000,
    'test-seed-requester-wallet',
    'test'
  )$$,
  'fund the requester wallet for escrow tests'
);

select pg_temp.make_user('22222222-2222-2222-2222-222222222222', 'Near Helper', '+2348000000102') as _ \gset
select pg_temp.make_user('33333333-3333-3333-3333-333333333333', 'Alt Helper', '+2348000000103') as _ \gset
select pg_temp.make_user('55555555-5555-5555-5555-555555555555', 'Far Helper', '+2348000000105') as _ \gset
select pg_temp.make_user('66666666-6666-6666-6666-666666666666', 'Browser', '+2348000000106') as _ \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Generator repair',
  'My generator will not start. 5kVA, was fine yesterday.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as request_id \gset

select create_request(
  'Hallway cleaning',
  'Need the hallway mopped before guests arrive.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as cleaning_request_id \gset

select create_request(
  'Expired fixture',
  'This one has already run past its window.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as expired_request_id \gset

select create_request(
  'Cancelled fixture',
  'This one will be cancelled before anyone answers.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as cancelled_request_id \gset

select throws_ok(
  $$select create_request(
    'Title only',
    null,
    6.5000,
    3.3800,
    'Yaba, Lagos',
    null,
    5000
  )$$,
  '22023',
  'description must be between 1 and 1000 characters',
  'create_request rejects a missing description'
);

select throws_ok(
  $$select create_request(
    'Whitespace only',
    '   ',
    6.5000,
    3.3800,
    'Yaba, Lagos',
    null,
    5000
  )$$,
  '22023',
  'description must be between 1 and 1000 characters',
  'create_request rejects a whitespace-only description'
);

select isnt(
  (select description from public.requests where id = :'request_id'::uuid),
  null,
  'requests.description is stored for every created request'
);

-- Request tags -------------------------------------------------------------------------

select id as tag_plumbing_id from public.tags where slug = 'plumbing' \gset
select id as tag_moving_id from public.tags where slug = 'moving' \gset
select id as tag_cleaning_id from public.tags where slug = 'cleaning' \gset
select id as tag_food_id from public.tags where slug = 'food' \gset

select create_request(
  'Tagged help',
  'Need help with pipes under the sink.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000,
  null,
  null,
  array[:'tag_plumbing_id'::uuid, :'tag_moving_id'::uuid]
) as tagged_request_id \gset

select is(
  (select count(*) from public.request_tags where request_id = :'tagged_request_id'::uuid),
  2::bigint,
  'create_request stores catalogue tags on the request'
);

select throws_ok(
  format(
    $$select create_request(
      'Too many tags',
      'This should fail tag validation on the server.',
      6.5000,
      3.3800,
      'Yaba, Lagos',
      null,
      5000,
      null,
      null,
      ARRAY[%L::uuid, %L::uuid, %L::uuid, %L::uuid]
    )$$,
    :'tag_plumbing_id',
    :'tag_moving_id',
    :'tag_cleaning_id',
    :'tag_food_id'
  ),
  '22023',
  'a request may have at most 3 tags',
  'create_request rejects more than three tags'
);

select throws_ok(
  $$select create_request(
    'Bad tag',
    'This should fail when a tag id is not in the catalogue.',
    6.5000,
    3.3800,
    'Yaba, Lagos',
    null,
    5000,
    null,
    null,
    array['00000000-0000-0000-0000-000000000099'::uuid]
  )$$,
  '22023',
  'one or more tags are invalid or inactive',
  'create_request rejects unknown tag ids'
);

select pg_temp.act_as_owner() as _ \gset
update public.requests
set expires_at = now() - interval '1 minute'
where id = :'expired_request_id';

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select cancel_request(%L)', :'cancelled_request_id'),
  'the requester can cancel a posted request'
);

-- Discovery -------------------------------------------------------------------------

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  1::bigint,
  'any signed-in user can browse a posted request near them'
);

select is(
  (select distance_m from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  100,
  'browsed distance is bucketed rather than exact'
);

select is(
  (select count(*) from browse_nearby_requests(7.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  1::bigint,
  'a browser outside discovery radius still sees open requests in global discovery'
);

select is(
  (select respond_allowed from browse_request(:'request_id', 7.5000::double precision, 3.3800::double precision)),
  false,
  'browsing a far request is allowed but responding is not'
);

select is(
  (select respond_allowed from browse_request(:'request_id', 6.5000::double precision, 3.3800::double precision)),
  true,
  'browsing a nearby request allows responding'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select lives_ok(
  $$select public.record_request_search('generator repair')$$,
  'record_request_search stores a normalized query'
);

select is(
  (select count(*) from public.search_request_queries('gen', 10) where normalized_query = 'generator repair'),
  1::bigint,
  'search_request_queries returns prefix matches'
);

select is(
  (select count(*) from search_requests('generator', 6.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  1::bigint,
  'search_requests matches request titles'
);

select is(
  (select count(*) from search_requests('5kVA', 7.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  1::bigint,
  'search_requests matches descriptions across distance'
);

select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'expired_request_id'),
  0::bigint,
  'an expired request disappears from discovery while still posted on the row'
);

select is(
  (select count(*) from browse_request(:'expired_request_id', 6.5000::double precision, 3.3800::double precision)),
  0::bigint,
  'an expired request cannot be opened from discovery'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  public.expire_request(:'expired_request_id'::uuid),
  true,
  'expire_request persists a due posted request as expired'
);

select is(
  (select status::text from public.requests where id = :'expired_request_id'::uuid),
  'expired',
  'expiration writes the expired status on the request row'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'cancelled_request_id'),
  0::bigint,
  'a cancelled request disappears from discovery'
);

select is(
  (select description from browse_request(:'request_id', 6.5000::double precision, 3.3800::double precision)),
  'My generator will not start. 5kVA, was fine yesterday.',
  'opening a nearby request returns its public description'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  1::bigint,
  'a requester sees their own posted request in nearby discovery'
);

select pg_temp.act_as_owner() as _ \gset
select ok(
  not exists (
    select 1
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('browse_nearby_requests', 'browse_request')
      and pg_get_function_result(p.oid) ~* 'response_count|phone|latitude|longitude'
  ),
  'public discovery does not return response counts, phone, or coordinates'
);

-- Escrow on expiration --------------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Funded expiry',
  'Funded request that should refund when the window ends.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  7500
) as funded_expired_request_id \gset

select pg_temp.act_as_owner() as _ \gset
update public.requests
set expires_at = now() - interval '1 minute'
where id = :'funded_expired_request_id'::uuid;

select ok(
  public.expire_request(:'funded_expired_request_id'::uuid),
  'expiration refunds locked funds on a funded request'
);

select is(
  (select payment_status::text from public.requests where id = :'funded_expired_request_id'::uuid),
  'refunded',
  'expiration moves locked payment status to refunded'
);

select is(
  (select total from public.request_escrow where request_id = :'funded_expired_request_id'::uuid),
  7500::numeric,
  'escrow total equals the offer; fee is taken at payout'
);

-- Privacy before selection ----------------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select count(*) from public.requests where id = :'request_id'),
  0::bigint,
  'a browser cannot read the request row itself before selection'
);

select is(
  (select count(*) from get_engagement(:'request_id')),
  0::bigint,
  'nobody gets engagement details before selection'
);

select is(
  (select count(*) from public.profiles where id <> auth.uid()),
  0::bigint,
  'a user cannot read anyone else''s profile; counterparty details come from functions'
);

select is(
  (select count(*) from public.user_attendance where user_id <> auth.uid()),
  0::bigint,
  'a user cannot read anyone else''s attendance row'
);

select throws_ok(
  $$insert into public.requests (
      requester_id, title, description, location, location_label
    )
    values (
      auth.uid(), 'Hack', 'writing straight to the table instead',
      extensions.ST_SetSRID(extensions.ST_MakePoint(3.38, 6.5), 4326)::extensions.geography,
      'Yaba, Lagos'
    )$$,
  '42501',
  null,
  'a client cannot write a request directly; only create_request can'
);

select pg_temp.act_as('55555555-5555-5555-5555-555555555555') as _ \gset
select throws_ok(
  format(
    $$select respond_to_request(%L, null, null, %s, %s)$$,
    :'request_id',
    7.5000,
    3.3800
  ),
  '55000',
  'this request is no longer available to you',
  'responding is distance-checked from the position sent'
);

-- Responding ------------------------------------------------------------------------

select pg_temp.act_as('55555555-5555-5555-5555-555555555555') as _ \gset
select pg_temp.act_as_owner() as _ \gset
update public.profiles
set avatar_path = null,
    avatar_captured_in_app = false
where id = '55555555-5555-5555-5555-555555555555'::uuid;

select pg_temp.act_as('55555555-5555-5555-5555-555555555555') as _ \gset
select throws_ok(
  format(
    $$select respond_to_request(%L, null, null, 6.5000, 3.3800)$$,
    :'request_id'
  ),
  '55000',
  'add a profile photo in the app before responding',
  'responding requires an in-app profile photo'
);

select pg_temp.act_as_owner() as _ \gset
update public.profiles
set avatar_path = '55555555-5555-5555-5555-555555555555/avatar.jpg',
    avatar_captured_in_app = true
where id = '55555555-5555-5555-5555-555555555555'::uuid;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'request_id',
  'I fix these. Can be there soon.',
  7000,
  6.5000,
  3.3800
) as response_id \gset

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select is(
  (select count(*) from public.request_responses where request_id = :'request_id'),
  0::bigint,
  'a browser cannot see who responded or how many responses exist'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format(
    $$select respond_to_request(%L, %L, %L, %L, %L)$$,
    :'request_id',
    'Updated note.',
    7500,
    6.5000,
    3.3800
  ),
  'responding twice updates the same pending response idempotently'
);

select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  0::bigint,
  'a pending response removes the request from public discovery for that helper'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select count(*) from list_request_responses(:'request_id')),
  1::bigint,
  'the requester sees the response'
);

select is(
  (select pending_response_count from my_requests where request_id = :'request_id'),
  1,
  'the request reports a waiting response while it is still posted'
);

select is(
  (select count(*)::integer from public.request_conversations where request_id = :'request_id'::uuid),
  0,
  'responding does not create a conversation'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333') as _ \gset
select respond_to_request(
  :'request_id',
  'I can take this one too.',
  6500,
  6.5400,
  3.3800
) as alternate_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Second generator',
  'Second generator, same street, still will not start.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as second_request_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select respond_to_request(%L, null, null, 6.5000, 3.3800)', :'second_request_id'),
  'a helper can respond to another request before being selected'
);

select id as second_response_id
from public.request_responses
where request_id = :'second_request_id'
  and responder_id = '22222222-2222-2222-2222-222222222222' \gset

-- Selection and attendance ----------------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select accept_response(%L)', :'response_id'),
  'the requester selects one helper'
);

select throws_ok(
  format('select accept_response(%L)', :'alternate_response_id'),
  '55000',
  'someone is already helping on this request',
  'a requester cannot select a second helper on the same request'
);

select is(
  (select status::text from my_requests where request_id = :'request_id'),
  'accepted',
  'selection moves the request to accepted'
);

select is(
  (select agreed_provider_amount from public.requests where id = :'request_id'::uuid),
  7500::numeric,
  'selection stores the counter offer as the agreed amount'
);

select is(
  (select count(*)::integer from public.request_conversations where request_id = :'request_id'::uuid),
  1,
  'selection creates one request conversation'
);

select is(
  (
    select (requester_id, selected_user_id)
    from public.request_conversations
    where request_id = :'request_id'::uuid
  ),
  ('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid),
  'conversation participants are the requester and selected helper'
);

select id as conversation_id
from public.request_conversations
where request_id = :'request_id'::uuid \gset

select pg_temp.act_as_owner() as _ \gset
select is(
  (
    select m.body
    from public.request_messages m
    where m.conversation_id = :'conversation_id'::uuid
      and m.message_type = 'system'::public.conversation_message_type
      and m.metadata ->> 'lifecycle_key' = 'lifecycle:' || :'request_id'::text || ':selected'
  ),
  'Near was selected to help with this request.',
  'selection adds a lifecycle system message to the conversation'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (
    select count(*)
    from public.notification_inbox ni
    where ni.user_id = '22222222-2222-2222-2222-222222222222'::uuid
      and ni.request_id = :'request_id'::uuid
      and ni.type = 'new_message'::public.notification_type
  ),
  0::bigint,
  'selection lifecycle system messages do not create new_message notifications'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select messaging_enabled from public.get_request_conversation(:'request_id'::uuid)),
  true,
  'messaging stays enabled while the request is active'
);
select is(
  (select conversation_id from public.get_request_conversation(:'request_id'::uuid)),
  :'conversation_id'::uuid,
  'the requester can load the conversation after selection'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select conversation_id from public.get_request_conversation(:'request_id'::uuid)),
  :'conversation_id'::uuid,
  'the selected helper can load the conversation after selection'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333') as _ \gset
select is(
  (select count(*) from public.get_request_conversation(:'request_id'::uuid)),
  0::bigint,
  'a non-selected responder cannot access the conversation'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  public.ensure_request_conversation(
    :'request_id'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid
  ),
  :'conversation_id'::uuid,
  'ensure_request_conversation returns the existing conversation'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format($$select public.set_request_conversation_focus(%L)$$, :'conversation_id'),
  'the helper can mark the conversation as actively viewed'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    $$select public.send_request_message(%L, %L)$$,
    :'conversation_id',
    'On my way'
  ),
  'a participant can send a message'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (
    select count(*)
    from public.notification_inbox ni
    where ni.user_id = '22222222-2222-2222-2222-222222222222'::uuid
      and ni.type = 'new_message'::public.notification_type
  ),
  0::bigint,
  'viewing the thread suppresses new_message inbox noise for the recipient'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  $$select public.set_request_conversation_focus(null::uuid)$$,
  'the helper can clear conversation focus when leaving the thread'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (
    select count(*)
    from public.notification_inbox ni
    where ni.user_id = '11111111-1111-1111-1111-111111111111'::uuid
      and ni.type = 'new_message'::public.notification_type
  ),
  0::bigint,
  'the sender does not receive a new_message notification for their own message'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format(
    $$select public.send_request_message(%L, %L)$$,
    :'conversation_id',
    'Sure, I can be there around 4.'
  ),
  'the selected helper can send a message through rpc'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select message_id, attachment_id, storage_path
from public.begin_request_message_with_attachments(
  :'conversation_id'::uuid,
  'Here is a photo',
  jsonb_build_array(
    jsonb_build_object(
      'file_name', 'photo.jpg',
      'mime_type', 'image/jpeg',
      'file_size', 1024,
      'attachment_type', 'image'
    )
  )
)
limit 1 \gset

select pg_temp.act_as_owner() as _ \gset
insert into storage.objects (bucket_id, name, owner, metadata)
values (
  'conversation-media',
  :'storage_path',
  '11111111-1111-1111-1111-111111111111'::uuid,
  jsonb_build_object('mimetype', 'image/jpeg', 'name', 'photo.jpg', 'size', 1024)
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format($$select public.complete_request_message_with_attachments(%L::uuid)$$, :'message_id'),
  'a participant can complete an attachment message after uploading to conversation-media'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (
    select count(*)
    from public.notification_inbox ni
    where ni.user_id = '22222222-2222-2222-2222-222222222222'::uuid
      and ni.type = 'new_message'::public.notification_type
      and ni.dedupe_key = 'request_message:' || :'message_id'
  ),
  1::bigint,
  'completing an attachment message creates a single new_message notification'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (
    select ni.body
    from public.notification_inbox ni
    where ni.dedupe_key = 'request_message:' || :'message_id'
    limit 1
  ),
  'Near sent you a message.',
  'text plus attachment uses the generic new_message body'
);

select is(
  (
    select a.attachment_type::text
    from public.request_message_attachments a
    join public.request_messages m on m.id = a.message_id
    where m.conversation_id = :'conversation_id'::uuid
    order by a.created_at desc
    limit 1
  ),
  'image',
  'attachment rows store attachment_type from the uploaded content type'
);

select is(
  (
    select m.message_type::text
    from public.request_messages m
    where m.conversation_id = :'conversation_id'::uuid
      and exists (
        select 1
        from public.request_message_attachments a
        where a.message_id = m.id
      )
    order by m.created_at desc
    limit 1
  ),
  'text',
  'messages with attachments remain text messages'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format(
    $$select * from public.begin_request_message_with_attachments(
      %L::uuid,
      '',
      jsonb_build_array(
        jsonb_build_object(
          'file_name', 'virus.exe',
          'mime_type', 'image/jpeg',
          'file_size', 1024,
          'attachment_type', 'image'
        )
      )
    )$$,
    :'conversation_id'
  ),
  '22023',
  'This file type isn''t supported.',
  'begin rejects dangerous attachment filenames'
);

select throws_ok(
  format(
    $$select * from public.begin_request_message_with_attachments(
      %L::uuid,
      '',
      jsonb_build_array(
        jsonb_build_object(
          'file_name', 'huge.jpg',
          'mime_type', 'image/jpeg',
          'file_size', 6000000,
          'attachment_type', 'image'
        )
      )
    )$$,
    :'conversation_id'
  ),
  '22023',
  'This file is too large.',
  'begin rejects planned attachments over the image size limit'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select message_id
from public.begin_request_message_with_attachments(
  :'conversation_id'::uuid,
  'draft abort',
  jsonb_build_array(
    jsonb_build_object(
      'file_name', 'draft.jpg',
      'mime_type', 'image/jpeg',
      'file_size', 1024,
      'attachment_type', 'image'
    )
  ),
  gen_random_uuid()
)
limit 1 \gset

select lives_ok(
  format($$select public.abort_request_message_with_attachments(%L::uuid)$$, :'message_id'),
  'sender can abort an incomplete attachment message'
);

select is(
  (
    select count(*)
    from public.request_messages m
    where m.id = :'message_id'::uuid
  ),
  0::bigint,
  'abort removes the draft message row'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select message_id as pending_draft_message_id
from public.begin_request_message_with_attachments(
  :'conversation_id'::uuid,
  'secret draft caption',
  jsonb_build_array(
    jsonb_build_object(
      'file_name', 'pending.jpg',
      'mime_type', 'image/jpeg',
      'file_size', 1024,
      'attachment_type', 'image'
    )
  ),
  gen_random_uuid()
)
limit 1 \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (
    select count(*)
    from public.request_message_attachments a
    where a.message_id = :'pending_draft_message_id'::uuid
  ),
  0::bigint,
  'the recipient cannot read pending attachment rows via table rls'
);

select is(
  (
    select count(*)
    from public.list_request_messages(:'conversation_id'::uuid)
    where message_id = :'pending_draft_message_id'::uuid
  ),
  0::bigint,
  'the recipient does not see in-progress attachment messages in list'
);

select is(
  (
    select count(*)
    from public.get_request_message_for_viewer(:'pending_draft_message_id'::uuid)
  ),
  0::bigint,
  'hydration rpc hides in-progress attachment messages from the recipient'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format($$select public.abort_request_message_with_attachments(%L::uuid)$$, :'pending_draft_message_id'),
  'sender can abort the pending draft used for visibility tests'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select message_id as photo_only_message_id, storage_path as photo_only_storage_path
from public.begin_request_message_with_attachments(
  :'conversation_id'::uuid,
  '',
  jsonb_build_array(
    jsonb_build_object(
      'file_name', 'photo-only.jpg',
      'mime_type', 'image/jpeg',
      'file_size', 1024,
      'attachment_type', 'image'
    )
  ),
  gen_random_uuid()
)
limit 1 \gset

select pg_temp.act_as_owner() as _ \gset
insert into storage.objects (bucket_id, name, owner, metadata)
values (
  'conversation-media',
  :'photo_only_storage_path',
  '22222222-2222-2222-2222-222222222222'::uuid,
  jsonb_build_object('mimetype', 'image/jpeg', 'name', 'photo-only.jpg', 'size', 1024)
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format($$select public.complete_request_message_with_attachments(%L::uuid)$$, :'photo_only_message_id'),
  'helper can complete a photo-only attachment message'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (
    select ni.body
    from public.notification_inbox ni
    where ni.dedupe_key = 'request_message:' || :'photo_only_message_id'
    limit 1
  ),
  'Near sent you a photo.',
  'image-only attachment notifications mention a photo'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select message_id as multi_message_id, attachment_id as multi_attachment_id_1, storage_path as multi_storage_path_1
from public.begin_request_message_with_attachments(
  :'conversation_id'::uuid,
  'Two files attached',
  jsonb_build_array(
    jsonb_build_object(
      'file_name', 'one.pdf',
      'mime_type', 'application/pdf',
      'file_size', 1024,
      'attachment_type', 'file'
    ),
    jsonb_build_object(
      'file_name', 'two.txt',
      'mime_type', 'text/plain',
      'file_size', 512,
      'attachment_type', 'file'
    )
  ),
  gen_random_uuid()
)
limit 1 \gset

select storage_path as multi_storage_path_2
from public.request_message_attachments a
where a.message_id = :'multi_message_id'::uuid
  and a.id <> :'multi_attachment_id_1'::uuid
limit 1 \gset

select pg_temp.act_as_owner() as _ \gset
insert into storage.objects (bucket_id, name, owner, metadata)
values
  (
    'conversation-media',
    :'multi_storage_path_1',
    '11111111-1111-1111-1111-111111111111'::uuid,
    jsonb_build_object('mimetype', 'application/pdf', 'name', 'one.pdf', 'size', 1024)
  ),
  (
    'conversation-media',
    :'multi_storage_path_2',
    '11111111-1111-1111-1111-111111111111'::uuid,
    jsonb_build_object('mimetype', 'text/plain', 'name', 'two.txt', 'size', 512)
  );

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format($$select public.complete_request_message_with_attachments(%L::uuid)$$, :'multi_message_id'),
  'a participant can complete a multi-attachment message'
);

select is(
  (
    select jsonb_array_length(attachments)
    from public.list_request_messages(:'conversation_id'::uuid)
    where message_id = :'multi_message_id'::uuid
  ),
  2::bigint,
  'list_request_messages returns every attachment on a multi-attachment message'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333') as _ \gset
select is(
  (
    select count(*)
    from public.get_request_message_for_viewer(:'photo_only_message_id'::uuid)
  ),
  0::bigint,
  'a non-participant cannot hydrate an attachment message by id'
);

select is(
  public.can_read_conversation_media(:'photo_only_storage_path'),
  false,
  'a non-participant cannot pass storage read policy for a chat attachment path'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  public.can_read_conversation_media(:'photo_only_storage_path'),
  true,
  'a conversation participant can pass storage read policy for a completed attachment'
);

select is(
  public.can_write_conversation_media(
    replace(
      :'photo_only_storage_path',
      split_part(:'photo_only_storage_path', '/', 3),
      '00000000-0000-0000-0000-000000000000'
    )
  ),
  false,
  'storage write policy rejects manipulated conversation ids in the path'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format($$select public.send_request_message(%L, %L)$$, :'conversation_id', 'Text-only still works'),
  'text-only send_request_message still succeeds alongside attachment messages'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (
    select ni.body
    from public.notification_inbox ni
    where ni.user_id = '11111111-1111-1111-1111-111111111111'::uuid
      and ni.type = 'new_message'::public.notification_type
    order by ni.created_at desc
    limit 1
  ),
  'Near sent you a message.',
  'the requester receives a new_message notification when the helper replies'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format(
    $$insert into public.request_messages (conversation_id, sender_id, message_type, body)
      values (%L, '11111111-1111-1111-1111-111111111111', 'system', 'Voice call ended')$$,
    :'conversation_id'
  ),
  '42501',
  null,
  'participants cannot insert chat rows directly (rpc only)'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select count(*) from public.list_my_request_conversations()),
  1::bigint,
  'the messages inbox lists one conversation for each party'
);

select is(
  (select unread_count from public.list_my_request_conversations()),
  1,
  'the requester sees one unread message from the helper'
);

select lives_ok(
  format($$select public.mark_request_conversation_read(%L)$$, :'conversation_id'),
  'the requester can mark the conversation read'
);

select is(
  (select unread_count from public.list_my_request_conversations()),
  0,
  'unread count clears after marking read'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset

select pg_temp.act_as('33333333-3333-3333-3333-333333333333') as _ \gset
select throws_ok(
  format(
    $$select public.send_request_message(%L, %L)$$,
    :'conversation_id',
    'Should not send'
  ),
  '42501',
  'conversation not found or not accessible',
  'a non-participant cannot send messages'
);

select is(
  (
    select count(*)
    from public.list_request_messages(:'conversation_id'::uuid)
  ),
  0::bigint,
  'a non-participant cannot list messages by guessing a conversation id'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (select provider_amount from public.request_escrow where request_id = :'request_id'::uuid),
  6750::numeric,
  'escrow stores the helper net payout (90% of agreed offer)'
);

select is(
  (select total from public.request_escrow where request_id = :'request_id'::uuid),
  7500::numeric,
  'escrow total equals the agreed offer amount'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Lower counter',
  'Accepting a lower counter offer refunds the difference.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as lower_offer_request_id \gset

select pg_temp.act_as('33333333-3333-3333-3333-333333333333') as _ \gset
select respond_to_request(
  :'lower_offer_request_id'::uuid,
  null,
  4000,
  6.5000,
  3.3800
) as lower_offer_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select accept_response(%L)', :'lower_offer_response_id'),
  'requester can accept a lower counter offer'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (select total from public.request_escrow where request_id = :'lower_offer_request_id'::uuid),
  4000::numeric,
  'a lower counter offer reduces the locked total to the new offer'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (
    select count(*)::integer
    from public.user_attendance
    where user_id = '22222222-2222-2222-2222-222222222222'
      and request_id = :'request_id'::uuid
  ),
  1,
  'selection records attendance on the chosen helper'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select accept_response(%L)', :'second_response_id'),
  '55000',
  'This person is already committed to another request at this time.',
  'cannot select a helper for a same-day conflicting commitment'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (
    select responder_available
    from list_request_responses(:'second_request_id')
    where response_id = :'second_response_id'
  ),
  false,
  'requesters see when a responder has a schedule conflict'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Later week job',
  'Scheduled on a different day so the same helper can be selected.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  now() + interval '2 days',
  5000,
  null,
  null,
  '{}'::uuid[]
) as future_request_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'future_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800
) as future_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select accept_response(%L)', :'future_response_id'),
  'a helper can be selected on another day while committed elsewhere'
);

select is(
  (
    select count(*)::integer
    from public.user_attendance
    where user_id = '22222222-2222-2222-2222-222222222222'
  ),
  2,
  'selection keeps one attendance row per committed request'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select respond_to_request(%L, null, null, 6.5000, 3.3800)', :'second_request_id'),
  'a helper can still respond to other requests while attending a job'
);

-- Privacy after selection -----------------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select count(*) from public.requests where id = :'request_id'),
  1::bigint,
  'the selected helper can now read the request row'
);

select is(
  (select counterparty_phone from get_engagement(:'request_id')),
  '+2348000000101',
  'the selected helper receives the requester''s phone number'
);

select ok(
  (select request_latitude from get_engagement(:'request_id')) = 6.5000,
  'the selected helper receives the exact location'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select is(
  (select count(*) from browse_nearby_requests(6.5000::double precision, 3.3800::double precision) where request_id = :'request_id'),
  0::bigint,
  'a request leaves public discovery once someone is selected'
);

-- Service lifecycle after selection -------------------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select start_request(%L)', :'request_id'),
  'the selected helper can move the request to in progress'
);

select is(
  (select request_status::text from get_engagement(:'request_id')),
  'in_progress',
  'start_request writes in_progress on the request'
);

select lives_ok(
  format('select mark_service_complete(%L)', :'request_id'),
  'the selected helper can mark the request completion pending'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select request_status::text from get_engagement(:'request_id')),
  'completion_pending',
  'mark_service_complete moves the request to completion_pending'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (
    select m.body
    from public.request_messages m
    where m.conversation_id = :'conversation_id'::uuid
      and m.metadata ->> 'lifecycle_key' = 'lifecycle:' || :'request_id'::text || ':completion_pending'
  ),
  'Near marked the request as complete.',
  'marking complete adds a lifecycle system message'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select ok(
  (select completion_confirm_by from get_engagement(:'request_id')) > now(),
  'mark_service_complete sets a confirmation deadline'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select complete_request(%L)', :'request_id'),
  'the requester can confirm completion'
);

select is(
  (select status::text from public.requests where id = :'request_id'::uuid),
  'completed',
  'confirmation completes the request'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select messaging_enabled from public.get_request_conversation(:'request_id'::uuid)),
  false,
  'messaging is read-only after the request completes'
);

select throws_ok(
  format(
    $$select public.send_request_message(%L, %L)$$,
    :'conversation_id',
    'Trying after completion'
  ),
  '55000',
  'this conversation is read-only',
  'participants cannot send messages on a completed request'
);

select ok(
  exists (
    select 1
    from public.list_my_request_conversations() inbox
    where inbox.request_id = :'request_id'::uuid
      and inbox.messaging_enabled = false
  ),
  'completed conversations remain in the messages inbox as read-only'
);

select is(
  (select payment_status::text from public.requests where id = :'request_id'::uuid),
  'released',
  'confirmation releases escrow to the helper wallet'
);

select lives_ok(
  format('select rate_request(%L::uuid, 5::smallint, %L)', :'request_id', 'Great work'),
  'requester can rate the selected helper after completion'
);

select is(
  (
    select ratee_id
    from public.ratings
    where request_id = :'request_id'::uuid
      and rater_id = '11111111-1111-1111-1111-111111111111'::uuid
  ),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'rating is stored against the selected helper'
);

select ok(
  (select viewer_has_rated from get_engagement(:'request_id')),
  'requester has submitted a rating'
);

select is(
  (select rating_stars from get_engagement(:'request_id')),
  null::smallint,
  'requester does not yet see their own rating on the completion card'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset

select lives_ok(
  format('select rate_request(%L::uuid, 4::smallint, %L)', :'request_id', 'Clear brief'),
  'helper can rate the requester after completion'
);

select is(
  (
    select ratee_id
    from public.ratings
    where request_id = :'request_id'::uuid
      and rater_id = '22222222-2222-2222-2222-222222222222'::uuid
  ),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'helper rating is stored against the requester'
);

select ok(
  (select viewer_has_rated from get_engagement(:'request_id')),
  'helper has submitted a rating'
);

select is(
  (select rating_stars from get_engagement(:'request_id')),
  5::smallint,
  'helper sees the requester rating on the completion card'
);

select is(
  (select rating_comment from get_engagement(:'request_id')),
  'Great work',
  'helper sees the requester rating comment'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset

select is(
  (select rating_stars from get_engagement(:'request_id')),
  4::smallint,
  'requester sees the helper rating on the completion card'
);

select is(
  (select rating_comment from get_engagement(:'request_id')),
  'Clear brief',
  'requester sees the helper rating comment'
);

select pg_temp.act_as_owner() as _ \gset
select ok(
  (
    select count(*)::integer
    from public.user_attendance
    where user_id = '22222222-2222-2222-2222-222222222222'
      and request_id = :'request_id'::uuid
  ) = 0,
  'completion clears attendance for the finished request only'
);

select pg_temp.act_as('55555555-5555-5555-5555-555555555555') as _ \gset
select respond_to_request(
  :'cleaning_request_id'::uuid,
  'I can mop the hallway.',
  null,
  6.5000,
  3.3800
) as cleaning_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select accept_response(%L)', :'cleaning_response_id'),
  'select a helper on the cleaning request for auto-complete coverage'
);

select pg_temp.act_as('55555555-5555-5555-5555-555555555555') as _ \gset
select lives_ok(
  format('select mark_service_complete(%L)', :'cleaning_request_id'),
  'helper marks the cleaning request complete'
);

select pg_temp.act_as_owner() as _ \gset
update public.requests
set completion_confirm_by = now() - interval '1 minute'
where id = :'cleaning_request_id'::uuid;

select ok(
  public.auto_complete_request(:'cleaning_request_id'::uuid),
  'auto_complete_request completes after the confirmation window'
);

select is(
  (select status::text from public.requests where id = :'cleaning_request_id'::uuid),
  'completed',
  'automatic completion writes completed status'
);

select ok(
  not public.auto_complete_request(:'cleaning_request_id'::uuid),
  'auto_complete_request is idempotent once completed'
);

-- Expiration idempotency and selection race -----------------------------------------

select pg_temp.act_as_owner() as _ \gset
select ok(
  not public.expire_request(:'expired_request_id'::uuid),
  'expire_request is idempotent once the row is already expired'
);

select is(
  (select count(*) from public.request_status_events
   where request_id = :'expired_request_id'::uuid and to_status = 'expired'),
  1::bigint,
  'expiration records a single status event'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Past window',
  'Nobody can be chosen after the open window ends.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as past_window_request_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'past_window_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800
) as past_window_response_id \gset

select pg_temp.act_as_owner() as _ \gset
update public.requests
set expires_at = now() - interval '1 minute'
where id = :'past_window_request_id'::uuid;

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select accept_response(%L)', :'past_window_response_id'),
  '55000',
  null,
  'selection is rejected once the request open window has ended'
);

select pg_temp.act_as_owner() as _ \gset
select ok(
  not public.expire_request(:'request_id'::uuid),
  'expiration does not override a request that was already selected'
);

-- Cancellation before selection -----------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Cancel with responses',
  'Funded request cancelled before selection.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  4000
) as cancel_funded_request_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'cancel_funded_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800
) as _ \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select cancel_request(%L)', :'cancel_funded_request_id'),
  'requester can cancel before selection'
);

select is(
  (select status::text from public.requests where id = :'cancel_funded_request_id'::uuid),
  'cancelled',
  'cancellation writes cancelled status'
);

select is(
  (select payment_status::text from public.requests where id = :'cancel_funded_request_id'::uuid),
  'refunded',
  'pre-selection cancellation refunds locked funds'
);

select is(
  (select status::text from public.request_responses
   where request_id = :'cancel_funded_request_id'::uuid
   limit 1),
  'expired',
  'pending responses become inactive when the requester cancels'
);

select is(
  (select count(*) from public.request_status_events
   where request_id = :'cancel_funded_request_id'::uuid and to_status = 'cancelled'),
  1::bigint,
  'cancellation records a status event'
);

select lives_ok(
  format('select cancel_request(%L)', :'cancel_funded_request_id'),
  'cancel_request is idempotent after the request is already cancelled'
);

-- Authorization and privacy hardening ------------------------------------------------

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format(
    $$select respond_to_request(%L, null, null, 6.5000, 3.3800)$$,
    :'second_request_id'
  ),
  '55000',
  null,
  'the requester cannot respond to their own request'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333') as _ \gset
select is(
  (select count(*) from list_request_responses(:'request_id')),
  0::bigint,
  'only the requester can list responses on a request'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select is(
  (select count(*) from get_engagement(:'request_id')),
  0::bigint,
  'bystanders cannot read engagement details'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format('select mark_service_complete(%L)', :'second_request_id'),
  'P0002',
  null,
  'the requester cannot mark a request complete for the helper'
);

select pg_temp.act_as('66666666-6666-6666-6666-666666666666') as _ \gset
select throws_ok(
  format('select complete_request(%L)', :'request_id'),
  'P0002',
  null,
  'only the requester can confirm completion on their request'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select complete_request(%L)', :'request_id'),
  'confirming completion again is idempotent once completed'
);

select pg_temp.act_as_owner() as _ \gset
select is(
  (select count(*)
   from public.payment_transitions
   where request_id = :'request_id'::uuid
     and idempotency_key = 'complete:' || :'request_id'),
  1::bigint,
  'payment release uses a single idempotent completion transition'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  $$update public.profiles set phone = '+2348000000999' where id = auth.uid()$$,
  '42501',
  'profile field is server managed and cannot be set by a client',
  'clients cannot forge a verified phone number on their profile'
);

select throws_ok(
  $$update public.profiles
    set avatar_captured_in_app = true, avatar_path = 'fake/avatar.jpg'
    where id = auth.uid()$$,
  '42501',
  'profile field is server managed and cannot be set by a client',
  'clients cannot forge an in-app profile photo'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Cancel during selection',
  'Cancelled while a response is still pending.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as cancel_race_request_id \gset

select pg_temp.act_as('33333333-3333-3333-3333-333333333333') as _ \gset
select respond_to_request(
  :'cancel_race_request_id'::uuid,
  null,
  null,
  6.5000,
  3.3800
) as cancel_race_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select cancel_request(%L)', :'cancel_race_request_id'),
  'requester can cancel before selection completes'
);

select throws_ok(
  format('select accept_response(%L)', :'cancel_race_response_id'),
  '55000',
  null,
  'selection fails after the request was cancelled'
);

-- Tag interest request notifications -------------------------------------------------

select id as electrician_tag_id
from public.tags
where slug = 'electrician'
limit 1 \gset

select id as carpenter_tag_id
from public.tags
where slug = 'carpenter'
limit 1 \gset

select pg_temp.act_as_owner() as _ \gset
update public.profiles
set discovery_location = public.assert_coordinates(6.5400, 3.3800),
    discovery_location_updated_at = now()
where id in (
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select set_notification_tag_interests(array[:'electrician_tag_id'::uuid]);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333') as _ \gset
select set_notification_tag_interests(array[:'carpenter_tag_id'::uuid]);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Help me install a ceiling fan',
  'Need an electrician for ceiling fan install.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000,
  null,
  null,
  array[:'electrician_tag_id'::uuid, :'tag_food_id'::uuid]
) as fan_notify_request_id \gset

select is(
  (
    select count(*)::integer
    from public.notification_inbox
    where user_id = '22222222-2222-2222-2222-222222222222'
      and request_id = :'fan_notify_request_id'::uuid
      and type = 'matching_request'
  ),
  1,
  'notifies a nearby user with a matching tag interest'
);

select is(
  (
    select title
    from public.notification_inbox
    where user_id = '22222222-2222-2222-2222-222222222222'
      and request_id = :'fan_notify_request_id'::uuid
      and type = 'matching_request'
    limit 1
  ),
  'New request',
  'tag-interest alerts use the new-request notification title when the request has a title'
);

select ok(
  (
    select body
    from public.notification_inbox
    where user_id = '22222222-2222-2222-2222-222222222222'
      and request_id = :'fan_notify_request_id'::uuid
      and type = 'matching_request'
    limit 1
  ) like '%Help me install a ceiling fan%',
  'tag-interest alert body quotes the request title'
);

select is(
  (
    select count(*)::integer
    from public.notification_inbox
    where user_id = '11111111-1111-1111-1111-111111111111'
      and request_id = :'fan_notify_request_id'::uuid
      and type = 'matching_request'
  ),
  0,
  'requesters are not notified about their own tag-matching requests'
);

select is(
  (
    select count(*)::integer
    from public.notification_inbox
    where user_id = '33333333-3333-3333-3333-333333333333'
      and request_id = :'fan_notify_request_id'::uuid
      and type = 'matching_request'
  ),
  0,
  'skips users whose interests do not match explicit request tags'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select set_notification_tag_interests(
  array[
    :'electrician_tag_id'::uuid,
    :'tag_food_id'::uuid,
    :'tag_plumbing_id'::uuid
  ]
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Another tagged job',
  'Tagged with food and plumbing.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000,
  null,
  null,
  array[:'tag_food_id'::uuid, :'tag_plumbing_id'::uuid]
) as multi_match_request_id \gset

select is(
  (
    select count(*)::integer
    from public.notification_inbox
    where user_id = '22222222-2222-2222-2222-222222222222'
      and request_id = :'multi_match_request_id'::uuid
      and type = 'matching_request'
  ),
  1,
  'sends one notification per request when several interests match'
);

select pg_temp.act_as_owner() as _ \gset
update public.profiles
set discovery_location = public.assert_coordinates(7.5000, 3.3800),
    discovery_location_updated_at = now()
where id = '55555555-5555-5555-5555-555555555555';

select pg_temp.act_as('55555555-5555-5555-5555-555555555555') as _ \gset
select set_notification_tag_interests(array[:'electrician_tag_id'::uuid]);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Fan install far away',
  'Should not notify helpers outside discovery radius.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000,
  null,
  null,
  array[:'electrician_tag_id'::uuid]
) as far_notify_request_id \gset

select is(
  (
    select count(*)::integer
    from public.notification_inbox
    where user_id = '55555555-5555-5555-5555-555555555555'
      and request_id = :'far_notify_request_id'::uuid
      and type = 'matching_request'
  ),
  0,
  'skips users outside the discovery radius'
);

-- Notification tag interests (settings RPC) -----------------------------------------

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset

select id as carpenter_tag_id
from public.tags
where slug = 'carpenter'
limit 1 \gset

select id as furniture_tag_id
from public.tags
where slug = 'furniture'
limit 1 \gset

select id as food_tag_id
from public.tags
where slug = 'food'
limit 1 \gset

select set_notification_tag_interests(
  array[
    :'electrician_tag_id'::uuid,
    :'carpenter_tag_id'::uuid,
    :'furniture_tag_id'::uuid,
    :'food_tag_id'::uuid
  ]
);

select is(
  (select count(*)::integer from public.list_notification_tag_interests()),
  4,
  'users can save up to five profile interests'
);

select id as gardening_tag_id
from public.tags
where slug = 'gardening'
limit 1 \gset

select id as cleaning_tag_id
from public.tags
where slug = 'cleaning'
limit 1 \gset

select lives_ok(
  $$select set_notification_tag_interests(array[
    :'electrician_tag_id'::uuid,
    :'carpenter_tag_id'::uuid,
    :'furniture_tag_id'::uuid,
    :'food_tag_id'::uuid,
    :'gardening_tag_id'::uuid
  ])$$,
  'profile interests accept five tags'
);

select throws_ok(
  $$select set_notification_tag_interests(array[
    :'electrician_tag_id'::uuid,
    :'carpenter_tag_id'::uuid,
    :'furniture_tag_id'::uuid,
    :'food_tag_id'::uuid,
    :'gardening_tag_id'::uuid,
    :'cleaning_tag_id'::uuid
  ])$$,
  '22023',
  'you may select at most 5 profile interests',
  'profile interests reject more than five tags'
);

select set_notification_tag_interests('{}'::uuid[]);

select throws_ok(
  $$select set_notification_tag_interests(array['00000000-0000-0000-0000-000000000099'::uuid])$$,
  '22023',
  'one or more tags are invalid or inactive',
  'notification interests reject unknown tag ids'
);

select set_notification_tag_interests('{}'::uuid[]);

select is(
  (select count(*)::integer from public.list_notification_tag_interests()),
  0,
  'clearing notification interests removes all rows'
);

-- Request system server E2E (creation, tags, description surfaces, security) ---------

select isnt_empty(
  $$select * from public.search_tags('plumb', 10)$$,
  'search_tags returns catalogue matches'
);

select is(
  (select slug from public.search_tags('#electrician', 5) limit 1),
  'electrician',
  'search_tags accepts hash-prefixed queries'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'No tags job',
  'Description for a request with zero tags.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000,
  null,
  null,
  '{}'::uuid[]
) as zero_tag_request_id \gset

select is(
  (select count(*)::bigint from public.request_tags where request_id = :'zero_tag_request_id'::uuid),
  0::bigint,
  'create_request accepts zero tags'
);

select create_request(
  'Three tag job',
  'Description for a three-tag request.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000,
  null,
  null,
  array[
    :'tag_plumbing_id'::uuid,
    :'tag_moving_id'::uuid,
    :'tag_cleaning_id'::uuid
  ]
) as three_tag_request_id \gset

select is(
  (select count(*)::bigint from public.request_tags where request_id = :'three_tag_request_id'::uuid),
  3::bigint,
  'create_request stores three catalogue tags'
);

select is(
  public.request_tag_slugs(:'tagged_request_id'::uuid),
  array['moving', 'plumbing'],
  'request_tag_slugs returns persisted catalogue slugs'
);

select is(
  (
    select description
    from public.browse_request(:'request_id'::uuid, 6.5400::double precision, 3.3800::double precision)
    limit 1
  ),
  (select description from public.requests where id = :'request_id'::uuid),
  'browse_request returns the stored description'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select is(
  (select description from public.get_engagement(:'request_id'::uuid) limit 1),
  (select description from public.requests where id = :'request_id'::uuid),
  'get_engagement exposes description after selection'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format(
    'select public.attach_tags_to_request(%L, %L::uuid[])',
    :'zero_tag_request_id',
    array[:'tag_food_id'::uuid]
  ),
  '42501',
  null,
  'clients cannot call attach_tags_to_request directly'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select set_notification_preferences(false, false, false, false, false);

select is(
  public.user_push_delivery_allowed(
    '22222222-2222-2222-2222-222222222222'::uuid,
    'matching_request'::public.notification_type
  ),
  false,
  'matching_request push respects disabled Requests & responses preference'
);

select set_notification_preferences(true, true, true, true, true);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format(
    'select respond_to_request(%L, %L, null, 6.5400, 3.3800)',
    :'second_request_id',
    'Can still respond on the same day while committed elsewhere.'
  ),
  'responding is not blocked by an existing same-day commitment'
);

select * from finish();

rollback;
