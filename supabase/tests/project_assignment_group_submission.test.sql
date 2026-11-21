-- Formal assignment submissions via project group chat

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

select pg_temp.make_user('f1111111-1111-1111-1111-111111111111', 'Submit Creator', '+2348000009001') as _ \gset
select pg_temp.make_user('f2222222-2222-2222-2222-222222222222', 'Submit Worker', '+2348000009002') as _ \gset
select pg_temp.make_user('f3333333-3333-3333-3333-333333333333', 'Submit Stranger', '+2348000009003') as _ \gset

select pg_temp.act_as('f1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'premium');

select public.create_project(
  'Submission chat project',
  null,
  null,
  '{}'::uuid[],
  'public'::public.project_funding_visibility,
  10000,
  5000,
  1000,
  (current_date + 10),
  null,
  'Africa/Lagos', 6.5244, 3.3792, 'Lagos'
) as project_id \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'f1111111-1111-1111-1111-111111111111'::uuid,
    15000000,
    'sub-seed',
    'sub-seed-ref'
  )$$,
  'seed wallet'
);

select pg_temp.act_as('f1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.contribute_to_project(%L::uuid, 8000, %L)', :'project_id', 'sub-fund'),
  'fund pool'
);

select public.create_project_assignment(
  :'project_id'::uuid,
  'f2222222-2222-2222-2222-222222222222'::uuid,
  'Deliverable',
  'Scope',
  'Files',
  'single'::public.payment_structure,
  5000,
  now() + interval '7 days'
) as assignment_id \gset

select pg_temp.act_as('f2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select public.accept_project_assignment(%L::uuid)', :'assignment_id'),
  'accept'
);

select pg_temp.act_as('f1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.reserve_project_assignment_compensation(%L::uuid)', :'assignment_id'),
  'reserve'
);

select pg_temp.act_as('f2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select public.start_project_assignment(%L::uuid)', :'assignment_id'),
  'commence'
);

select throws_ok(
  format(
    $$select public.begin_project_assignment_submission(
      %L::uuid,
      null,
      'note',
      '[]'::jsonb
    )$$,
    :'assignment_id'
  ),
  '22023',
  null,
  'requires at least one attachment'
);

select pg_temp.act_as('f2222222-2222-2222-2222-222222222222') as _ \gset
select message_id, storage_path, conversation_id
from public.begin_project_assignment_submission(
  :'assignment_id'::uuid,
  null,
  'Delivered build',
  '[{"file_name":"proof.pdf","mime_type":"application/pdf","attachment_type":"file","file_size":100}]'::jsonb
)
limit 1 \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  format(
    $$insert into storage.objects (bucket_id, name, owner, metadata)
      values (
        'conversation-media',
        %L,
        'f2222222-2222-2222-2222-222222222222'::uuid,
        '{"mimetype":"application/pdf","size":"100"}'::jsonb
      )$$,
    :'storage_path'
  ),
  'seed submission media object'
);

select pg_temp.act_as('f2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select public.complete_project_assignment_submission(%L::uuid)', :'message_id'),
  'worker completes formal submission'
);

select ok(
  coalesce(
    (select metadata->>'kind' from public.project_group_messages where id = :'message_id'::uuid),
    ''
  ) = 'project_assignment_submission',
  'submission message published with assignment metadata'
);

select throws_ok(
  format(
    $$select public.begin_project_assignment_submission(
      %L::uuid,
      null,
      'retry',
      '[{"file_name":"proof.pdf","mime_type":"application/pdf","attachment_type":"file","file_size":100}]'::jsonb
    )$$,
    :'assignment_id'
  ),
  '55000',
  null,
  'cannot begin a second submission while awaiting review'
);

select pg_temp.act_as('f3333333-3333-3333-3333-333333333333') as _ \gset
select throws_ok(
  format(
    $$select public.begin_project_assignment_submission(
      %L::uuid,
      null,
      'note',
      '[{"file_name":"proof.pdf","mime_type":"application/pdf","attachment_type":"file","file_size":100}]'::jsonb
    )$$,
    :'assignment_id'
  ),
  'P0002',
  null,
  'non-worker cannot begin submission'
);

select * from finish();
rollback;