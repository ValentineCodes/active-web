-- Guest (anon) marketplace read layer

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

create function pg_temp.make_user(p_id uuid, p_name text, p_phone text)
returns text language plpgsql as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, phone, phone_confirmed_at, created_at, updated_at
  ) values (
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
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  return p_id::text;
end;
$$;

create function pg_temp.act_as_anon()
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  return 'anon';
end;
$$;

create function pg_temp.act_as_owner()
returns text language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return 'postgres';
end;
$$;

select pg_temp.make_user('b1111111-1111-1111-1111-111111111111', 'Guest Requester', '+2348000009101') as _ \gset
select pg_temp.make_user('b2222222-2222-2222-2222-222222222222', 'Guest Helper', '+2348000009102') as _ \gset

select pg_temp.act_as_owner() as _ \gset
select public.wallet_record_deposit(
  'b1111111-1111-1111-1111-111111111111'::uuid,
  5_000_000,
  'guest-read-requester-wallet',
  'test'
) as _ \gset

select pg_temp.act_as('b1111111-1111-1111-1111-111111111111') as _ \gset
select public.create_request(
  'Guest browse request'::text,
  'Visible to guests when posted.'::text,
  6.5000::double precision,
  3.3800::double precision,
  'Yaba, Lagos'::text,
  null::timestamptz,
  5000::numeric,
  null::uuid,
  null::text,
  '{}'::uuid[],
  'single'::public.payment_structure,
  null::jsonb,
  null::timestamptz
) as public_request_id \gset

select public.set_username('guest_req_user');

select lives_ok($$select public.start_premium_trial()$$, 'premium for public project');

select public.create_project(
  'Public guest project',
  'Fund me',
  null,
  '{}'::uuid[],
  'public'::public.project_funding_visibility,
  10_000,
  5_000,
  1_000,
  (current_date + 14),
  null,
  'Africa/Lagos',
  6.5244,
  3.3792,
  'Lagos, Nigeria'
) as public_project_id \gset

select public.create_project(
  'Invite only guest project',
  'Private',
  null,
  '{}'::uuid[],
  'invite_only'::public.project_funding_visibility,
  10_000,
  5_000,
  1_000,
  (current_date + 14),
  null,
  'Africa/Lagos',
  6.5244,
  3.3792,
  'Lagos, Nigeria'
) as private_project_id \gset

select pg_temp.act_as_owner() as _ \gset
update public.requests
set attachment_path = 'b1111111-1111-1111-1111-111111111111/drafts/guest-photo.jpg'
where id = :'public_request_id'::uuid;

-- Positive: anon browse requests -------------------------------------------------

select pg_temp.act_as_anon() as _ \gset

select lives_ok(
  $$select count(*) from public.browse_open_requests(10, 0)$$,
  'anon browse_open_requests'
);

select ok(
  (
    select count(*)::int > 0
    from public.browse_open_requests(50, 0) b
    where b.request_id = :'public_request_id'::uuid
  ),
  'anon sees posted public request in open browse'
);

select ok(
  (
    select title = 'Guest browse request'
    from public.browse_request(
      :'public_request_id'::uuid,
      6.5400::double precision,
      3.3800::double precision
    )
  ),
  'anon browse_request returns public detail'
);

select ok(
  (
    select respond_allowed = false
    from public.browse_request(
      :'public_request_id'::uuid,
      6.5400::double precision,
      3.3800::double precision
    )
  ),
  'guest request detail has respond_allowed false'
);

select ok(
  (
    select location_label IS NOT NULL
       and location_label = 'Yaba, Lagos'
    from public.browse_request(
      :'public_request_id'::uuid,
      6.5400::double precision,
      3.3800::double precision
    )
  ),
  'guest sees coarse location_label only'
);

select lives_ok(
  format(
    $$select count(*) from public.search_requests('Guest', 6.54::double precision, 3.38::double precision, 10, 0)$$
  ),
  'anon search_requests'
);

-- Positive: anon projects --------------------------------------------------------

select ok(
  (
    select count(*)::int > 0
    from public.browse_open_projects(20, 0) p
    where p.project_id = :'public_project_id'::uuid
  ),
  'anon browse_open_projects lists public live project'
);

select ok(
  (
    select title = 'Public guest project'
    from public.browse_project(:'public_project_id'::uuid)
  ),
  'anon browse_project reads public project detail'
);

select ok(
  (
    select viewer_may_contribute = false
       and group_chat_conversation_id IS NULL
    from public.browse_project(:'public_project_id'::uuid)
  ),
  'guest project detail hides participation and chat ids'
);

-- Positive: profile and discover -------------------------------------------------

select ok(
  (
    select username = 'guest_req_user'
    from public.get_public_profile('guest_req_user')
  ),
  'anon get_public_profile'
);

select lives_ok(
  $$select public.search_discover('people'::public.search_discover_category, 'guest_req', null, null, 10, 0)$$,
  'anon search_discover people'
);

select lives_ok(
  $$select public.search_discover('projects'::public.search_discover_category, 'Public guest', null, null, 10, 0)$$,
  'anon search_discover projects'
);

select lives_ok(
  $$select public.record_discovery_coordinates(6.5, 3.38)$$,
  'record_discovery_coordinates no-op for guest'
);

select pg_temp.act_as_owner() as _ \gset
select ok(
  (
    select discovery_location IS NULL
    from public.profiles
    where id = 'b1111111-1111-1111-1111-111111111111'::uuid
  ),
  'guest did not persist discovery coordinates'
);

select pg_temp.act_as_anon() as _ \gset

-- Positive: listing media helper ------------------------------------------------

select ok(
  public.guest_can_read_marketplace_media(
    'b1111111-1111-1111-1111-111111111111/drafts/guest-photo.jpg'
  ),
  'guest_can_read_marketplace_media for posted request attachment'
);

-- Negative: private / auth-only --------------------------------------------------

select throws_ok(
  format($$select public.browse_project(%L::uuid)$$, :'private_project_id'),
  'P0002',
  null,
  'anon cannot browse invite-only project'
);

select throws_ok(
  $$select public.get_project(gen_random_uuid())$$,
  '42501',
  null,
  'get_project requires authentication'
);

select is(
  (select count(*)::int from public.notification_inbox),
  0,
  'anon sees no notification inbox rows via RLS'
);

select throws_ok(
  $$select public.get_engagement(gen_random_uuid())$$,
  '42501',
  null,
  'anon cannot read engagement'
);

select pg_temp.act_as('b1111111-1111-1111-1111-111111111111') as _ \gset
select public.create_request(
  'Expired anon hidden'::text,
  'No longer posted.'::text,
  6.5000::double precision,
  3.3800::double precision,
  'Hidden'::text,
  null::timestamptz,
  1000::numeric,
  null::uuid,
  null::text,
  '{}'::uuid[],
  'single'::public.payment_structure,
  null::jsonb,
  null::timestamptz
) as expired_request_id \gset

select pg_temp.act_as_owner() as _ \gset
update public.requests
set expires_at = now() - interval '1 hour'
where id = :'expired_request_id'::uuid;

select pg_temp.act_as_anon() as _ \gset

select pg_temp.act_as_anon() as _ \gset
select is(
  (
    select count(*)::int
    from public.browse_open_requests(100, 0) b
    where b.request_id = :'expired_request_id'::uuid
  ),
  0,
  'anon does not browse expired requests'
);

-- Authenticated regression: nearby respond_allowed when in radius ----------------

select pg_temp.act_as('b2222222-2222-2222-2222-222222222222') as _ \gset

select throws_ok(
  format($$select public.browse_project(%L::uuid)$$, :'public_project_id'),
  '42501',
  null,
  'browse_project rejects authenticated callers'
);

select ok(
  (
    select respond_allowed = true
    from public.browse_request(
      :'public_request_id'::uuid,
      6.5400::double precision,
      3.3800::double precision
    )
  ),
  'onboarded helper still gets respond_allowed near request'
);

select ok(
  (
    select count(*)::int > 0
    from public.browse_open_requests(20, 0)
  ),
  'authenticated browse_open_requests unchanged'
);

select * from finish();
rollback;