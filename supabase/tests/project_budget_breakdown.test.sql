-- Project budget breakdown accounting

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

select pg_temp.make_user('f1111111-1111-1111-1111-111111111111', 'Budget Creator', '+2348000009001') as _ \gset
select pg_temp.make_user('f2222222-2222-2222-2222-222222222222', 'Budget Worker', '+2348000009002') as _ \gset
select pg_temp.make_user('f3333333-3333-3333-3333-333333333333', 'Budget Contributor', '+2348000009003') as _ \gset
select pg_temp.make_user('f4444444-4444-4444-4444-444444444444', 'Budget Stranger', '+2348000009004') as _ \gset

select pg_temp.act_as('f1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'premium');

select public.create_project(
  'Budget breakdown',
  'Accounting test',
  null,
  '{}'::uuid[],
  'public'::public.project_funding_visibility,
  20000,
  8000,
  500,
  (current_date + 14),
  null,
  'Africa/Lagos', 6.5244, 3.3792, 'Lagos, Nigeria'
) as budget_project_id \gset

select pg_temp.act_as_owner() as _ \gset
select lives_ok(
  $$select public.wallet_record_deposit('f1111111-1111-1111-1111-111111111111'::uuid, 25000000, 'bd-creator', 'bd-creator-ref')$$,
  'fund creator'
);
select lives_ok(
  $$select public.wallet_record_deposit('f3333333-3333-3333-3333-333333333333'::uuid, 10000000, 'bd-contrib', 'bd-contrib-ref')$$,
  'fund contributor'
);

select pg_temp.act_as('f3333333-3333-3333-3333-333333333333') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'premium contributor');
select lives_ok(
  format('select public.contribute_to_project(%L::uuid, 5000, %L)', :'budget_project_id', 'bd-contrib-1'),
  'contribution'
);

select is(
  (select contributed_total_kobo from public.get_project(:'budget_project_id'::uuid)),
  500000::bigint,
  'contribution increases raised'
);

select pg_temp.act_as('f1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.contribute_to_project(%L::uuid, 5000, %L)', :'budget_project_id', 'bd-creator-contrib'),
  'creator tops up pool'
);

select is(
  (select paid_out_total_kobo from public.get_project(:'budget_project_id'::uuid)),
  0::bigint,
  'no paid out initially'
);

select public.create_project_assignment(
  :'budget_project_id'::uuid,
  'f2222222-2222-2222-2222-222222222222'::uuid,
  'Build',
  'scope',
  'deliverable',
  'single'::public.payment_structure,
  6000,
  now() + interval '10 days'
) as budget_assignment_id \gset

select pg_temp.act_as('f2222222-2222-2222-2222-222222222222') as _ \gset
select lives_ok($$select public.start_premium_trial()$$, 'premium worker');
select lives_ok(
  format('select public.accept_project_assignment(%L::uuid)', :'budget_assignment_id'),
  'worker accepts'
);

select pg_temp.act_as('f1111111-1111-1111-1111-111111111111') as _ \gset
select lives_ok(
  format('select public.reserve_project_assignment_compensation(%L::uuid)', :'budget_assignment_id'),
  'reserve compensation'
);

select is(
  (select reserved_total_kobo from public.get_project(:'budget_project_id'::uuid)),
  600000::bigint,
  'reservation increases secured unpaid'
);

select is(
  (select paid_out_total_kobo from public.get_project(:'budget_project_id'::uuid)),
  0::bigint,
  'reservation does not increase paid out'
);

select is(
  (select available_total_kobo from public.get_project(:'budget_project_id'::uuid)),
  400000::bigint,
  'available is unreserved pool balance without double-counting payout'
);

select pg_temp.act_as('f4444444-4444-4444-4444-444444444444') as _ \gset
select ok(
  NOT (select viewer_may_view_budget_breakdown from public.get_project(:'budget_project_id'::uuid)),
  'unrelated viewer cannot see budget breakdown'
);

select pg_temp.act_as('f3333333-3333-3333-3333-333333333333') as _ \gset
select ok(
  (select viewer_may_view_budget_breakdown from public.get_project(:'budget_project_id'::uuid)),
  'contributor may view breakdown'
);

select pg_temp.act_as('f2222222-2222-2222-2222-222222222222') as _ \gset
select ok(
  NOT (select viewer_may_view_budget_breakdown from public.get_project(:'budget_project_id'::uuid)),
  'worker without contribute role does not see breakdown amounts'
);

select is(
  (select paid_out_total_kobo from public.get_project(:'budget_project_id'::uuid)),
  NULL::bigint,
  'worker sees null paid out'
);

select * from finish();

rollback;