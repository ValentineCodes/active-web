-- User bank accounts: ownership, defaults, idempotent save, cross-user isolation.

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
  set display_name = p_name
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

select pg_temp.make_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Worker A', '+2348000000201');
select pg_temp.make_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Worker B', '+2348000000202');

select set_config('role', 'service_role', true);

select public.insert_user_bank_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  '058',
  'Guaranty Trust Bank',
  '0123456789',
  'WORKER A ACCOUNT',
  'RCP_test_a_1'
) as account_a_id \gset

select is(
  (select count(*)::int from public.user_bank_accounts where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  1,
  'service_role insert creates one account for worker A'
);

select is(
  public.insert_user_bank_account(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    '058',
    'Guaranty Trust Bank',
    '0123456789',
    'WORKER A ACCOUNT RETRY',
    'RCP_test_a_2'
  )::text,
  :'account_a_id',
  'retrying the same bank/account returns the existing row id'
);

select is(
  (select count(*)::int from public.user_bank_accounts where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  1,
  'idempotent save does not duplicate rows'
);

select is(
  (select account_name from public.user_bank_accounts where id = :'account_a_id'::uuid),
  'WORKER A ACCOUNT RETRY',
  'idempotent save refreshes resolved holder name and recipient metadata'
);

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select is(
  (select count(*)::int from public.list_my_bank_accounts()),
  1,
  'worker A lists only their account'
);

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

select is(
  (select count(*)::int from public.list_my_bank_accounts()),
  0,
  'worker B cannot see worker A accounts via list_my_bank_accounts'
);

select throws_ok(
  $$select public.delete_user_bank_account(:'account_a_id'::uuid)$$,
  '22023',
  'bank account not found',
  'worker B cannot delete worker A account'
);

select set_config('role', 'service_role', true);

select public.insert_user_bank_account(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  '044',
  'Access Bank',
  '0987654321',
  'WORKER A SECOND',
  'RCP_test_a_3'
) as account_a_second_id \gset

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select lives_ok(
  $$select public.set_default_user_bank_account(:'account_a_second_id'::uuid)$$,
  'worker A can set default on their own account'
);

select is(
  (select count(*)::int
   from public.user_bank_accounts
   where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
     and is_default),
  1,
  'exactly one default account per user'
);

select is(
  (select is_default from public.user_bank_accounts where id = :'account_a_second_id'::uuid),
  true,
  'newly selected account is default'
);

grant select on public.user_bank_accounts to authenticated;

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

select is(
  (select count(*)::int
   from public.user_bank_accounts
   where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  0,
  'RLS blocks worker B from selecting worker A rows when SELECT is granted'
);

revoke select on public.user_bank_accounts from authenticated;

select set_config('role', 'service_role', true);

select lives_ok(
  $$select public.ensure_wallet_account('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)$$,
  'ensure wallet for withdrawal linkage test'
);

select lives_ok(
  format(
    $$insert into public.wallet_transactions (
      wallet_id, user_id, type, amount, status, reference, metadata
    )
    select
      w.id,
      w.user_id,
      'withdrawal'::public.wallet_transaction_type,
      1000,
      'pending'::public.wallet_transaction_status,
      'test-withdraw-block-delete',
      jsonb_build_object('bank_account_id', %L)
    from public.wallets w
    where w.user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid$$,
    :'account_a_id'
  ),
  'seed pending withdrawal linked to bank account'
);

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select throws_ok(
  $$select public.delete_user_bank_account(:'account_a_id'::uuid)$$,
  '55000',
  'This account is tied to a withdrawal in progress',
  'cannot delete account referenced by pending withdrawal'
);

select finish();

rollback;
