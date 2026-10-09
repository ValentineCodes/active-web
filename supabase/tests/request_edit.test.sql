-- Request editing: eligibility, validation, persistence, ordering, and regressions.

begin;

create extension if not exists pgtap with schema extensions;

select plan(67);

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

select pg_temp.make_user('11111111-1111-1111-1111-111111111111', 'Edit Requester', '+2348000000201') as _ \gset
select pg_temp.make_user('22222222-2222-2222-2222-222222222222', 'Edit Helper', '+2348000000202') as _ \gset
select pg_temp.make_user('55555555-5555-5555-5555-555555555555', 'Far Helper', '+2348000000205') as _ \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    '11111111-1111-1111-1111-111111111111'::uuid,
    5000000,
    'request-edit-test-wallet',
    'test'
  )$$,
  'fund requester wallet for edit tests'
);

select id as tag_a from public.tags where slug = 'plumbing' limit 1 \gset
select id as tag_b from public.tags where slug = 'moving' limit 1 \gset
select id as tag_c from public.tags where slug = 'cleaning' limit 1 \gset
select id as tag_food_id from public.tags where slug = 'food' limit 1 \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Editable open request',
  'Valid description for edit tests.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as open_request_id \gset

-- ELIGIBILITY -----------------------------------------------------------------------

select is(
  (select is_editable from public.my_requests where request_id = :'open_request_id'::uuid),
  true,
  'owner can edit before any response'
);

select lives_ok(
  format(
    $$select update_request(
      %L, 'Editable open request', 'Valid description for edit tests.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null, '{}'::uuid[]
    )$$,
    :'open_request_id'
  ),
  'owner update succeeds before any response'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select throws_ok(
  format(
    $$select update_request(
      %L, 'Hijack title', 'Hijack description.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null, '{}'::uuid[]
    )$$,
    :'open_request_id'
  ),
  'P0002',
  'request not found',
  'non-owner cannot edit the request'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Pending response blocks edit',
  'Will receive a response.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as pending_response_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'pending_response_id',
  'Pending response blocks editing.',
  null,
  6.5400,
  3.3800
) as pending_response_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format(
    $$select update_request(
      %L, 'Nope', 'Should not apply.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null, '{}'::uuid[]
    )$$,
    :'pending_response_id'
  ),
  '55000',
  'this request can no longer be edited',
  'request with a pending response cannot be edited'
);

select is(
  (select is_editable from public.my_requests where request_id = :'pending_response_id'::uuid),
  false,
  'not editable while a response is pending'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select withdraw_response(%L)', :'pending_response_response_id'),
  'withdraw pending response'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select is_editable from public.my_requests where request_id = :'pending_response_id'::uuid),
  true,
  'editing available again after response withdrawal'
);

select lives_ok(
  format(
    $$select update_request(
      %L, 'Pending response blocks edit', 'Edited after withdrawal.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null, '{}'::uuid[]
    )$$,
    :'pending_response_id'
  ),
  'update succeeds after all responses withdrawn'
);

select lives_ok(
  format('select cancel_request(%L::uuid)', :'pending_response_id'),
  'cancel pending-response fixture to stay under open-request cap'
);

select create_request(
  'Declined response unlocks edit',
  'Decline path unlocks edit.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as declined_lock_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'declined_lock_id',
  'Please decline me.',
  null,
  6.5400,
  3.3800
) as decline_me_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select decline_response(%L, %L)', :'decline_me_response_id', 'Not a fit'),
  'requester declines the pending response'
);

select is(
  (select is_editable from public.my_requests where request_id = :'declined_lock_id'::uuid),
  true,
  'editing available again after response is declined'
);

select lives_ok(
  format(
    $$select update_request(
      %L, 'Declined response unlocks edit', 'Edited after decline.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null, '{}'::uuid[]
    )$$,
    :'declined_lock_id'
  ),
  'update succeeds after all responses declined'
);

select lives_ok(
  format('select cancel_request(%L::uuid)', :'declined_lock_id'),
  'cancel declined fixture to stay under open-request cap'
);

select create_request(
  'Accepted then cancelled',
  'Acceptance permanently disables edit.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as accepted_cancel_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'accepted_cancel_id',
  'Will be accepted then cancelled.',
  null,
  6.5400,
  3.3800
) as accepted_cancel_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select accept_response(%L::uuid)', :'accepted_cancel_response_id'),
  'accept helper before cancellation'
);

select lives_ok(
  format('select cancel_request(%L::uuid)', :'accepted_cancel_id'),
  'cancel request after acceptance'
);

select is(
  (select accepted_at is not null from public.requests where id = :'accepted_cancel_id'::uuid),
  true,
  'accepted_at preserved after cancellation'
);

select is(
  (select is_editable from public.my_requests where request_id = :'accepted_cancel_id'::uuid),
  false,
  'not editable after acceptance even when later cancelled'
);

select throws_ok(
  format(
    $$select update_request(
      %L, 'Accepted then cancelled', 'Should not apply.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null, '{}'::uuid[]
    )$$,
    :'accepted_cancel_id'
  ),
  '55000',
  'this request can no longer be edited',
  'update blocked after prior acceptance'
);

select create_request(
  'Deleted response row unlocks edit',
  'Row delete unlocks edit when never accepted.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as deleted_row_lock_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'deleted_row_lock_id',
  'Will be deleted by admin.',
  null,
  6.5400,
  3.3800
) as deleted_row_response_id \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  format(
    'delete from public.request_responses where id = %L::uuid',
    :'deleted_row_response_id'
  ),
  'admin deletes response row (legacy repair scenario)'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select is_editable from public.my_requests where request_id = :'deleted_row_lock_id'::uuid),
  true,
  'editing available again after response row is deleted'
);

select lives_ok(
  format('select cancel_request(%L::uuid)', :'deleted_row_lock_id'),
  'cancel deleted-row fixture to stay under open-request cap'
);

select create_request(
  'Failed respond unlock',
  'Failed response must not lock edit.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as failed_respond_id \gset

select pg_temp.act_as('55555555-5555-5555-5555-555555555555') as _ \gset
select throws_ok(
  format(
    'select respond_to_request(%L, null, null, 7.5000, 3.3800)',
    :'failed_respond_id'
  ),
  '55000',
  'this request is no longer available to you',
  'failed response submission does not insert a row'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select is(
  (select pending_response_count from public.my_requests where request_id = :'failed_respond_id'::uuid),
  0,
  'failed response leaves no pending responses'
);

select lives_ok(
  format(
    $$select update_request(
      %L, 'Failed respond unlock', 'Still editable after failed respond.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null, '{}'::uuid[]
    )$$,
    :'failed_respond_id'
  ),
  'edit still allowed after failed response attempt'
);

select lives_ok(
  format('select cancel_request(%L::uuid)', :'failed_respond_id'),
  'cancel failed-respond fixture to stay under open-request cap'
);

select create_request(
  'Expire me',
  'Will be expired for edit test.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as expire_me_id \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  format(
    $$update public.requests set expires_at = now() - interval '1 hour' where id = %L::uuid$$,
    :'expire_me_id'
  ),
  'force request expired for edit test'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format(
    $$select update_request(
      %L, 'Expire me', 'Still expired.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null, '{}'::uuid[]
    )$$,
    :'expire_me_id'
  ),
  '55000',
  'this request can no longer be edited',
  'expired request cannot be edited'
);

select lives_ok(
  format('select cancel_request(%L::uuid)', :'expire_me_id'),
  'cancel expired fixture (counts as non-open once expired)'
);

select create_request(
  'Cancel me',
  'Will be cancelled for edit test.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as cancel_me_id \gset

select lives_ok(
  format('select cancel_request(%L::uuid)', :'cancel_me_id'),
  'cancel request for edit test'
);

select throws_ok(
  format(
    $$select update_request(
      %L, 'Cancel me', 'Still cancelled.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null, '{}'::uuid[]
    )$$,
    :'cancel_me_id'
  ),
  '55000',
  'this request can no longer be edited',
  'cancelled request cannot be edited'
);

select create_request(
  'Complete me',
  'Will be completed for edit test.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as complete_me_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select respond_to_request(
  :'complete_me_id',
  'Will complete.',
  null,
  6.5400,
  3.3800
) as complete_me_response_id \gset

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select accept_response(%L::uuid)', :'complete_me_response_id'),
  'accept helper for completed edit test'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select mark_service_complete(%L::uuid)', :'complete_me_id'),
  'helper marks complete'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select complete_request(%L::uuid)', :'complete_me_id'),
  'requester confirms completion'
);

select throws_ok(
  format(
    $$select update_request(
      %L, 'Complete me', 'Still completed.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null, '{}'::uuid[]
    )$$,
    :'complete_me_id'
  ),
  '55000',
  'this request can no longer be edited',
  'completed request cannot be edited'
);

-- FORM VALIDATION -------------------------------------------------------------------

select create_request(
  'Validation target',
  'Validation tests.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as validation_id \gset

select throws_ok(
  format(
    $$select update_request(
      %L, '', 'Valid description here.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null, '{}'::uuid[]
    )$$,
    :'validation_id'
  ),
  '22023',
  'title must be between 3 and 120 characters',
  'empty title is rejected'
);

select lives_ok(
  format(
    $$select update_request(
      %L, 'Valid title', '   ',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null, '{}'::uuid[]
    )$$,
    :'validation_id'
  ),
  'blank description is accepted on update'
);

select is(
  (select description is null from public.requests where id = :'validation_id'::uuid),
  true,
  'blank description is stored as null'
);

select throws_ok(
  format(
    $$select update_request(
      %L, 'Valid title', 'Valid description.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 0, null, '{}'::uuid[]
    )$$,
    :'validation_id'
  ),
  '22023',
  'offer amount must be greater than zero',
  'invalid offer is rejected'
);

select throws_ok(
  format(
    $$select update_request(
      %L, 'Valid title', 'Valid description.',
      6.5000, 3.3800, 'Yaba, Lagos', now() - interval '2 days', 5000, null, '{}'::uuid[]
    )$$,
    :'validation_id'
  ),
  '22023',
  'scheduled time is in the past',
  'invalid scheduling is rejected'
);

select lives_ok(
  format(
    $$select update_request(
      %L, 'Valid title', 'Valid description.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null, '{}'::uuid[]
    )$$,
    :'validation_id'
  ),
  'zero tags accepted on update'
);

select lives_ok(
  format(
    $$select update_request(
      %L, 'Valid title', 'Valid description.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null,
      ARRAY[%L::uuid]::uuid[]
    )$$,
    :'validation_id',
    :'tag_a'
  ),
  'one tag accepted on update'
);

select lives_ok(
  format(
    $$select update_request(
      %L, 'Valid title', 'Valid description.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null,
      ARRAY[%L::uuid, %L::uuid]::uuid[]
    )$$,
    :'validation_id',
    :'tag_a',
    :'tag_b'
  ),
  'two tags accepted on update'
);

select lives_ok(
  format(
    $$select update_request(
      %L, 'Valid title', 'Valid description.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null,
      ARRAY[%L::uuid, %L::uuid, %L::uuid]::uuid[]
    )$$,
    :'validation_id',
    :'tag_a',
    :'tag_b',
    :'tag_c'
  ),
  'three tags accepted on update'
);

select is(
  (select count(*)::integer from public.request_tags where request_id = :'validation_id'::uuid),
  3,
  'three tags persisted on request'
);

select throws_ok(
  format(
    $$select update_request(
      %L, 'Valid title', 'Valid description.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null,
      ARRAY[%L::uuid, %L::uuid, %L::uuid, %L::uuid]::uuid[]
    )$$,
    :'validation_id',
    :'tag_a',
    :'tag_b',
    :'tag_c',
    :'tag_food_id'
  ),
  '22023',
  'a request may have at most 3 tags',
  'four tags rejected on update'
);

select throws_ok(
  format(
    $$select update_request(
      %L, 'Valid title', 'Valid description.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null,
      ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid]::uuid[]
    )$$,
    :'validation_id'
  ),
  '22023',
  'one or more tags are invalid or inactive',
  'unknown tag id rejected on update'
);

select lives_ok(
  format('select cancel_request(%L::uuid)', :'validation_id'),
  'cancel validation fixture to stay under open-request cap'
);

-- PERSISTENCE -----------------------------------------------------------------------

select create_request(
  'Persist fields',
  'Before persistence update.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as persist_id \gset

select location_label as label_before,
       extensions.st_x(location::extensions.geometry) as lon_before
from public.requests
where id = :'persist_id'::uuid \gset

select count(*)::integer as request_rows_before
from public.requests
where requester_id = '11111111-1111-1111-1111-111111111111'::uuid \gset

select lives_ok(
  format(
    $$select update_request(
      %L,
      'Persist fields updated',
      'After persistence update.',
      7.0000,
      3.5000,
      'Should not apply label',
      null,
      5100,
      null,
      ARRAY[%L::uuid]::uuid[]
    )$$,
    :'persist_id',
    :'tag_a'
  ),
  'persistence update succeeds'
);

select is(
  (select title from public.my_requests where request_id = :'persist_id'::uuid),
  'Persist fields updated',
  'updated title visible in my_requests'
);

select is(
  (select description from public.requests where id = :'persist_id'::uuid),
  'After persistence update.',
  'updated description persisted'
);

select is(
  (select location_label from public.requests where id = :'persist_id'::uuid),
  :'label_before',
  'edit does not change stored location label'
);

select is(
  (select extensions.st_x(location::extensions.geometry)::numeric = :'lon_before'::double precision
   from public.requests where id = :'persist_id'::uuid),
  true,
  'edit does not change stored coordinates'
);

select is(
  (select count(*)::integer from public.requests where requester_id = '11111111-1111-1111-1111-111111111111'::uuid),
  :'request_rows_before'::integer,
  'edit does not create duplicate request rows'
);

select is(
  (select count(*)::integer from public.request_responses where request_id = :'persist_id'::uuid),
  0,
  'edit does not create response rows'
);

select expires_at as persist_expiry_before,
       created_at as persist_created_before
from public.requests
where id = :'persist_id'::uuid \gset

select lives_ok(
  format(
    $$select update_request(
      %L, 'Persist fields updated', 'After persistence update.',
      7.0000, 3.5000, 'Ignored', null, 5100, null,
      ARRAY[%L::uuid]::uuid[]
    )$$,
    :'persist_id',
    :'tag_a'
  ),
  'second persistence update with unchanged schedule'
);

select is(
  (select expires_at = :'persist_expiry_before'::timestamptz
      and created_at = :'persist_created_before'::timestamptz
   from public.requests where id = :'persist_id'::uuid),
  true,
  'repeat edit preserves created_at and expires_at when timing unchanged'
);

select lives_ok(
  format('select cancel_request(%L::uuid)', :'persist_id'),
  'cancel persistence fixture to stay under open-request cap'
);

-- ORDERING (commit order; single-session) -------------------------------------------

select create_request(
  'Order edit first',
  'Concurrency ordering.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as order_edit_first_id \gset

select lives_ok(
  format(
    $$select update_request(
      %L, 'Order edit first updated', 'Edited before respond.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null, '{}'::uuid[]
    )$$,
    :'order_edit_first_id'
  ),
  'edit commits before first response'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format(
    'select respond_to_request(%L, %L, null, 6.5400, 3.3800)',
    :'order_edit_first_id',
    'Respond after edit.'
  ),
  'response succeeds after edit committed'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select create_request(
  'Order respond first',
  'Concurrency ordering.',
  6.5000,
  3.3800,
  'Yaba, Lagos',
  null,
  5000
) as order_respond_first_id \gset

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format(
    'select respond_to_request(%L, %L, null, 6.5400, 3.3800)',
    :'order_respond_first_id',
    'Respond before edit.'
  ),
  'response commits before edit attempt'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format(
    $$select update_request(
      %L, 'Too late', 'Should fail.',
      6.5000, 3.3800, 'Yaba, Lagos', null, 5000, null, '{}'::uuid[]
    )$$,
    :'order_respond_first_id'
  ),
  '55000',
  'this request can no longer be edited',
  'edit fails after response committed'
);

select is(
  (select is_editable from public.my_requests where request_id = :'order_respond_first_id'::uuid),
  false,
  'request not editable after successful response'
);

select lives_ok(
  format('select cancel_request(%L::uuid)', :'order_edit_first_id'),
  'cancel ordering fixture after respond-first locks edit'
);

select lives_ok(
  format('select cancel_request(%L::uuid)', :'order_respond_first_id'),
  'cancel respond-first ordering fixture'
);

-- REGRESSION SMOKE ------------------------------------------------------------------

select lives_ok(
  $$select create_request(
    'Regression create',
    'Create still works.',
    6.5000,
    3.3800,
    'Yaba, Lagos',
    null,
    5000
  )$$,
  'create_request still works after edit feature'
);

select pg_temp.act_as('22222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format(
    'select respond_to_request(%L, %L, null, 6.5400, 3.3800)',
    :'open_request_id',
    'Regression respond.'
  ),
  'respond_to_request still works'
);

select * from finish();

rollback;
