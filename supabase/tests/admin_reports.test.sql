-- Admin report queue access control and investigation overlay.

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

select pg_temp.make_user('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Support Admin', '+2348000000903');
select pg_temp.make_user('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Reporter User', '+2348000000904');
select pg_temp.make_user('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Provider User', '+2348000000905');

select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd');

select throws_ok(
  $$select public.admin_list_reports()$$,
  '42501',
  null,
  'non-admin cannot list reports'
);

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $$select public.admin_provision_member(
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    'support_admin'::public.admin_role
  )$$,
  'provision support admin for report tests'
);

insert into public.requests (
  id,
  requester_id,
  title,
  description,
  location_label,
  location,
  offered_amount,
  currency,
  status,
  payment_status,
  selected_user_id,
  submitted_at
)
values (
  '11111111-1111-1111-1111-111111111111',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Test disputed request',
  'Fixture for admin reports',
  'Lagos',
  extensions.st_setsrid(extensions.st_makepoint(3.4, 6.5), 4326),
  500000,
  'NGN',
  'disputed',
  'disputed',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  now()
);

insert into public.service_problems (
  id,
  request_id,
  kind,
  reported_by,
  status,
  status_before,
  payment_before,
  description
)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'other',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'open',
  'in_progress',
  'locked',
  'User allegation text for admin queue test'
);

select pg_temp.act_as('cccccccc-cccc-cccc-cccc-cccccccccccc');

select ok(
  (public.admin_list_reports()->>'total')::int >= 1,
  'support admin can list reports'
);

select lives_ok(
  $$select public.admin_assign_report(
    '22222222-2222-2222-2222-222222222222'::uuid,
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
  )$$,
  'support admin can assign report'
);

select lives_ok(
  $$select public.admin_add_report_note(
    '22222222-2222-2222-2222-222222222222'::uuid,
    'internal triage note'
  )$$,
  'support admin can add internal note'
);

select ok(
  (public.admin_get_report('22222222-2222-2222-2222-222222222222'::uuid)->'report'->>'assigned_admin_id')
    = 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'detail reflects assignment'
);

select throws_ok(
  $$select public.admin_update_report_investigation(
    '22222222-2222-2222-2222-222222222222'::uuid,
    'escalated'::public.service_problem_investigation_status,
    'short'
  )$$,
  '22023',
  null,
  'escalation requires substantive reason'
);

select * from finish();

rollback;
