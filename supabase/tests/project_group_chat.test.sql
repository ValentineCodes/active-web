-- Project shared group chat membership and access

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

create function pg_temp.act_as_owner()
returns text language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return 'postgres';
end;
$$;

select pg_temp.make_user('e1111111-1111-1111-1111-111111111111', 'Group Creator', '+2348000008001') as _ \gset
select pg_temp.make_user('e2222222-2222-2222-2222-222222222222', 'Group Worker', '+2348000008002') as _ \gset
select pg_temp.make_user('e3333333-3333-3333-3333-333333333333', 'Group Stranger', '+2348000008003') as _ \gset

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'premium creator');

select public.create_project(
  'Group chat project',
  'Membership test',
  null,
  '{}'::uuid[],
  'public'::public.project_funding_visibility,
  15000,
  5000,
  500,
  (current_date + 7),
  null,
  'Africa/Lagos', 6.5244, 3.3792, 'Lagos, Nigeria'
) as group_project_id \gset

select ok(
  exists (
    SELECT 1
    FROM public.project_group_conversation_members m
    JOIN public.project_group_conversations c ON c.id = m.conversation_id
    WHERE c.project_id = :'group_project_id'::uuid
      AND m.user_id = 'e1111111-1111-1111-1111-111111111111'::uuid
      AND m.role = 'creator'::public.project_group_member_role
  ),
  'creator added at project creation'
);

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'e1111111-1111-1111-1111-111111111111'::uuid,
    20000000,
    'group-creator-wallet',
    'group-creator-wallet-ref'
  )$$,
  'fund creator wallet'
);

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.contribute_to_project(%L::uuid, 6000, %L)', :'group_project_id', 'group-min-pool'),
  'meet funding target'
);

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'e2222222-2222-2222-2222-222222222222'::uuid,
    5000000,
    'group-worker-wallet',
    'group-worker-wallet-ref'
  )$$,
  'fund worker'
);

select pg_temp.act_as('e2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'premium worker');

select public.respond_to_project(
  :'group_project_id'::uuid,
  'pending response',
  4000,
  5,
  'day'::public.delivery_duration_unit
) as pending_assignment_id \gset

select is(
  public.project_group_conversation_for_project(
    :'group_project_id'::uuid,
    'e2222222-2222-2222-2222-222222222222'::uuid
  ),
  NULL::uuid,
  'pending worker not in group'
);

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.accept_project_worker_response(%L::uuid)', :'pending_assignment_id'),
  'creator accepts worker'
);

select ok(
  exists (
    SELECT 1
    FROM public.project_group_conversation_members m
    JOIN public.project_group_conversations c ON c.id = m.conversation_id
    WHERE c.project_id = :'group_project_id'::uuid
      AND m.user_id = 'e2222222-2222-2222-2222-222222222222'::uuid
      AND m.role = 'worker'::public.project_group_member_role
  ),
  'worker added after acceptance'
);

select pg_temp.act_as('e3333333-3333-3333-3333-333333333333') as _ \gset
select throws_ok(
  format('select public.send_request_message(%L::uuid, %L)', 
    public.project_group_conversation_for_project(:'group_project_id'::uuid, 'e1111111-1111-1111-1111-111111111111'::uuid),
    'hi'
  ),
  '42501',
  null,
  'non-member cannot send'
);

select pg_temp.act_as('e1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    'select public.send_request_message(%L::uuid, %L)',
    public.project_group_conversation_for_project(:'group_project_id'::uuid, 'e1111111-1111-1111-1111-111111111111'::uuid),
    'Welcome to the team'
  ),
  'creator can send group message'
);

select pg_temp.act_as('e2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format(
    'select public.send_request_message(%L::uuid, %L)',
    public.project_group_conversation_for_project(:'group_project_id'::uuid, 'e2222222-2222-2222-2222-222222222222'::uuid),
    'Thanks'
  ),
  'accepted worker can send'
);

select cmp_ok(
  public.project_group_unread_count(
    public.project_group_conversation_for_project(:'group_project_id'::uuid, 'e1111111-1111-1111-1111-111111111111'::uuid),
    'e1111111-1111-1111-1111-111111111111'::uuid
  ),
  '>=',
  1::integer,
  'unread count for creator'
);

select * from finish();

rollback;