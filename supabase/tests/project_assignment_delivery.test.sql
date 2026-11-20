-- Deliverables, sequential milestones, payouts, fees, disputes

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

select pg_temp.make_user('d1111111-1111-1111-1111-111111111111', 'Delivery Creator', '+2348000007001') as _ \gset
select pg_temp.make_user('d2222222-2222-2222-2222-222222222222', 'Delivery Worker', '+2348000007002') as _ \gset

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'premium');

select public.create_project(
  'Delivery project',
  null,
  null,
  '{}'::uuid[],
  'public'::public.project_funding_visibility,
  10000,
  5000,
  1000,
  (current_date + 10),
  null,
  'Africa/Lagos'
) as project_id \gset

select lives_ok(
  format('select public.open_project_funding(%L::uuid)', :'project_id'),
  'open'
);

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit(
    'd1111111-1111-1111-1111-111111111111'::uuid,
    15000000,
    'del-seed',
    'del-seed-ref'
  )$$,
  'seed wallet'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.contribute_to_project(%L::uuid, 8000, %L)', :'project_id', 'del-fund'),
  'fund pool'
);

select public.create_project_assignment(
  :'project_id'::uuid,
  'd2222222-2222-2222-2222-222222222222'::uuid,
  'Milestone build',
  'Two-step delivery',
  'Docs and deploy',
  'milestone'::public.payment_structure,
  5000,
  now() + interval '14 days',
  $milestones$[
    {"title": "Phase A", "description": "Docs", "amount": 3000},
    {"title": "Phase B", "description": "Deploy", "amount": 2000}
  ]$milestones$::jsonb
) as milestone_assignment_id \gset

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select public.accept_project_assignment(%L::uuid)', :'milestone_assignment_id'),
  'accept'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.reserve_project_assignment_compensation(%L::uuid)', :'milestone_assignment_id'),
  'reserve'
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select public.start_project_assignment(%L::uuid)', :'milestone_assignment_id'),
  'start'
);

select pg_temp.act_as_owner() as _ \gset

select is(
  (
    select status::text
    from public.project_assignment_milestones m
    where m.assignment_id = :'milestone_assignment_id'::uuid and m.position = 1
  ),
  'in_progress',
  'first milestone active after start'
);

select m1.id as milestone_one_id
from public.project_assignment_milestones m1
where m1.assignment_id = :'milestone_assignment_id'::uuid and m1.position = 1 \gset

select m2.id as milestone_two_id
from public.project_assignment_milestones m2
where m2.assignment_id = :'milestone_assignment_id'::uuid and m2.position = 2 \gset

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset

select public.submit_project_assignment_deliverable(
  :'milestone_assignment_id'::uuid,
  'Phase A deliverable',
  ARRAY['project/delivery/a.pdf'],
  :'milestone_one_id'::uuid
) as submission_one_id \gset

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    'select public.request_project_assignment_revision(%L::uuid, %L)',
    :'submission_one_id',
    'Need more detail'
  ),
  'revision request'
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format(
    'select public.submit_project_assignment_deliverable(%L::uuid, %L, %L::text[], %L::uuid)',
    :'milestone_assignment_id',
    'Resubmit phase A',
    ARRAY['project/delivery/a-v2.pdf'],
    :'milestone_one_id'
  ),
  'resubmit after revision'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format(
    'select public.approve_project_assignment_milestone(%L::uuid, %L)',
    :'milestone_two_id',
    'm2-early'
  ),
  '55000',
  null,
  'cannot approve second milestone before first'
);

select public.approve_project_assignment_milestone(
  :'milestone_one_id'::uuid,
  'm1-pay'
) as payment_one_id \gset

select pg_temp.act_as_owner() as _ \gset

select ok(
  (
    select m.status::text = 'approved_paid'
       and m2.status::text = 'in_progress'
    from public.project_assignment_milestones m
    join public.project_assignment_milestones m2
      on m2.assignment_id = m.assignment_id and m2.position = 2
    where m.id = :'milestone_one_id'::uuid
  ),
  'first paid and second unlocked'
);

select ok(
  (
    select r.released_kobo < r.amount_kobo
    from public.project_assignment_reservations r
    where r.assignment_id = :'milestone_assignment_id'::uuid
  ),
  'reservation partially released after first milestone'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset

select is(
  public.approve_project_assignment_milestone(:'milestone_one_id'::uuid, 'm1-pay'),
  :'payment_one_id'::uuid,
  'duplicate milestone approval is idempotent'
);

-- Single-payment deliverable flow with dispute hold ---------------------------------------

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select public.create_project_assignment(
  :'project_id'::uuid,
  'd2222222-2222-2222-2222-222222222222'::uuid,
  'Single deliverable',
  null,
  'One-shot output',
  'single'::public.payment_structure,
  2000,
  now() + interval '7 days'
) as single_assignment_id \gset

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select public.accept_project_assignment(%L::uuid)', :'single_assignment_id'),
  'accept single'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.reserve_project_assignment_compensation(%L::uuid)', :'single_assignment_id'),
  'reserve single'
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format('select public.start_project_assignment(%L::uuid)', :'single_assignment_id'),
  'start single'
);

select public.submit_project_assignment_deliverable(
  :'single_assignment_id'::uuid,
  'Final output',
  ARRAY['project/delivery/final.zip'],
  null
) as single_submission_id \gset

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    $$select public.report_project_assignment_problem(
      %L::uuid,
      'completion_issue'::public.service_problem_kind,
      'Quality concerns on deliverable',
      '{}'::text[]
    )$$,
    :'single_assignment_id'
  ),
  'open dispute'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select throws_ok(
  format(
    'select public.approve_project_assignment_single(%L::uuid, %L)',
    :'single_assignment_id',
    'single-pay-blocked'
  ),
  '55000',
  null,
  'payout blocked by open dispute'
);

select pg_temp.act_as_owner() as _ \gset
update public.project_assignment_disputes
set status = 'resolved', resolved_at = now()
where assignment_id = :'single_assignment_id'::uuid;

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    'select public.approve_project_assignment_single(%L::uuid, %L)',
    :'single_assignment_id',
    'single-pay-1'
  ),
  'payout after dispute resolved'
);

select pg_temp.act_as_owner() as _ \gset

select ok(
  (
    select fee_kobo > 0 and provider_kobo > 0
    from public.project_assignment_payments
    where assignment_id = :'single_assignment_id'::uuid
    limit 1
  ),
  'service fee recorded on payout'
);

select ok(
  (
    select count(*) >= 2
    from public.project_assignment_submissions s
    where s.assignment_id = :'milestone_assignment_id'::uuid
  ),
  'submission history preserved'
);

select ok(
  (
    select count(*) = 1
    from public.project_assignment_revisions r
    join public.project_assignment_submissions s on s.id = r.submission_id
    where s.id = :'submission_one_id'::uuid
  ),
  'revision history preserved'
);

select pg_temp.act_as('d2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok(
  format(
    'select public.submit_project_assignment_deliverable(%L::uuid, %L, %L::text[], %L::uuid)',
    :'milestone_assignment_id',
    'Phase B complete',
    ARRAY['project/delivery/b.zip'],
    :'milestone_two_id'
  ),
  'submit milestone two'
);

select pg_temp.act_as('d1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format(
    'select public.approve_project_assignment_milestone(%L::uuid, %L)',
    :'milestone_two_id',
    'm2-pay'
  ),
  'approve milestone two'
);

select is(
  (select status::text from public.get_project_assignment(:'milestone_assignment_id'::uuid)),
  'completed',
  'milestone assignment completes after final payout'
);

select * from finish();

rollback;