-- Active internal wallet: available / locked / pending buckets, immutable ledger,
-- request escrow. External payment provider credits available only via wallet_record_deposit.

create table public.platform_wallet (
  id smallint primary key default 1 check (id = 1),
  available numeric(12, 2) not null default 0 check (available >= 0),
  currency text not null default 'NGN' check (char_length(currency) = 3),
  updated_at timestamptz not null default now()
);

insert into public.platform_wallet (id) values (1);

create table public.wallet_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  available numeric(12, 2) not null default 0 check (available >= 0),
  locked numeric(12, 2) not null default 0 check (locked >= 0),
  pending numeric(12, 2) not null default 0 check (pending >= 0),
  currency text not null default 'NGN' check (char_length(currency) = 3),
  updated_at timestamptz not null default now()
);

create table public.request_escrow (
  request_id uuid primary key references public.requests (id) on delete restrict,
  requester_id uuid not null references public.profiles (id) on delete restrict,
  provider_amount numeric(12, 2) not null check (provider_amount > 0),
  service_fee numeric(12, 2) not null check (service_fee >= 0),
  total numeric(12, 2) not null check (total = provider_amount + service_fee),
  currency text not null default 'NGN' check (char_length(currency) = 3),
  escrow_bucket text not null default 'locked' check (escrow_bucket in ('locked', 'pending')),
  created_at timestamptz not null default now()
);

create index request_escrow_requester_idx on public.request_escrow (requester_id);

create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  user_id uuid references public.profiles (id) on delete restrict,
  request_id uuid references public.requests (id) on delete restrict,
  kind text not null,
  available_delta numeric(12, 2) not null default 0,
  locked_delta numeric(12, 2) not null default 0,
  pending_delta numeric(12, 2) not null default 0,
  platform_available_delta numeric(12, 2) not null default 0,
  external_reference text,
  created_at timestamptz not null default now()
);

create index wallet_ledger_request_idx on public.wallet_ledger (request_id, created_at);
create index wallet_ledger_user_idx on public.wallet_ledger (user_id, created_at);

alter table public.platform_wallet enable row level security;
alter table public.wallet_accounts enable row level security;
alter table public.request_escrow enable row level security;
alter table public.wallet_ledger enable row level security;

revoke all on public.platform_wallet from anon, authenticated;
revoke all on public.wallet_accounts from anon, authenticated;
revoke all on public.request_escrow from anon, authenticated;
revoke all on public.wallet_ledger from anon, authenticated;

grant select on public.wallet_accounts to authenticated;

create policy "users read own wallet"
  on public.wallet_accounts for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.ensure_wallet_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.wallet_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.ensure_wallet_account(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone)
  on conflict (id) do nothing;

  insert into public.provider_availability (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.wallet_accounts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Matches src/config.ts SERVICE_FEE_RATE (0.1) and summarizeRequestFunding().
create or replace function public.compute_request_charge(p_provider_amount numeric)
returns table (
  provider_amount numeric,
  service_fee numeric,
  total numeric
)
language sql
immutable
set search_path = ''
as $$
  select
    p_provider_amount as provider_amount,
    round(p_provider_amount * 0.1, 0) as service_fee,
    p_provider_amount + round(p_provider_amount * 0.1, 0) as total;
$$;

revoke all on function public.compute_request_charge(numeric) from public, anon, authenticated;

create or replace function public.post_wallet_ledger(
  p_idempotency_key text,
  p_user_id uuid,
  p_request_id uuid,
  p_kind text,
  p_available_delta numeric,
  p_locked_delta numeric,
  p_pending_delta numeric,
  p_platform_available_delta numeric default 0,
  p_external_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.wallet_accounts%rowtype;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.wallet_ledger wl where wl.idempotency_key = p_idempotency_key
  ) then
    return;
  end if;

  if p_user_id is not null then
    perform public.ensure_wallet_account(p_user_id);

    select * into v_account
    from public.wallet_accounts wa
    where wa.user_id = p_user_id
    for update;

    update public.wallet_accounts
    set available = available + p_available_delta,
        locked = locked + p_locked_delta,
        pending = pending + p_pending_delta,
        updated_at = now()
    where user_id = p_user_id;

    select * into v_account
    from public.wallet_accounts wa
    where wa.user_id = p_user_id;

    if v_account.available < 0 or v_account.locked < 0 or v_account.pending < 0 then
      raise exception 'wallet balance cannot go negative' using errcode = '55000';
    end if;
  end if;

  if p_platform_available_delta <> 0 then
    update public.platform_wallet
    set available = available + p_platform_available_delta,
        updated_at = now()
    where id = 1;

    if (select available from public.platform_wallet where id = 1) < 0 then
      raise exception 'platform wallet cannot go negative' using errcode = '55000';
    end if;
  end if;

  insert into public.wallet_ledger (
    idempotency_key,
    user_id,
    request_id,
    kind,
    available_delta,
    locked_delta,
    pending_delta,
    platform_available_delta,
    external_reference
  )
  values (
    p_idempotency_key,
    p_user_id,
    p_request_id,
    p_kind,
    p_available_delta,
    p_locked_delta,
    p_pending_delta,
    p_platform_available_delta,
    p_external_reference
  );
end;
$$;

revoke all on function public.post_wallet_ledger(
  text, uuid, uuid, text, numeric, numeric, numeric, numeric, text
) from public, anon, authenticated;

-- Credits available after an external payment provider confirms funds (not the internal ledger).
create or replace function public.wallet_record_deposit(
  p_user_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_external_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'deposit amount must be positive' using errcode = '22023';
  end if;

  perform public.post_wallet_ledger(
    p_idempotency_key,
    p_user_id,
    null,
    'external_deposit',
    p_amount,
    0,
    0,
    0,
    p_external_reference
  );
end;
$$;

revoke all on function public.wallet_record_deposit(uuid, numeric, text, text)
  from public, anon, authenticated;

create or replace function public.lock_request_escrow(
  p_request_id uuid,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.requests%rowtype;
  v_charge record;
begin
  select * into v_request
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_request.offered_amount is null or v_request.offered_amount <= 0 then
    return;
  end if;

  select * into v_charge from public.compute_request_charge(v_request.offered_amount);

  insert into public.request_escrow (
    request_id,
    requester_id,
    provider_amount,
    service_fee,
    total,
    currency,
    escrow_bucket
  )
  values (
    p_request_id,
    v_request.requester_id,
    v_charge.provider_amount,
    v_charge.service_fee,
    v_charge.total,
    v_request.currency,
    'locked'
  )
  on conflict (request_id) do nothing;

  perform public.post_wallet_ledger(
    p_idempotency_key || ':escrow_lock',
    v_request.requester_id,
    p_request_id,
    'escrow_lock',
    -v_charge.total,
    v_charge.total,
    0
  );

  perform public.apply_payment_transition(
    p_request_id,
    'locked'::public.payment_status,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.lock_request_escrow(uuid, text) from public, anon, authenticated;

create or replace function public.sync_wallet_payment_transition(
  p_request_id uuid,
  p_from public.payment_status,
  p_to public.payment_status,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escrow public.request_escrow%rowtype;
  v_provider_id uuid;
begin
  if not exists (select 1 from public.request_escrow re where re.request_id = p_request_id) then
    return;
  end if;

  select * into v_escrow
  from public.request_escrow re
  where re.request_id = p_request_id;

  select r.provider_id into v_provider_id
  from public.requests r
  where r.id = p_request_id;

  if p_from = 'locked' and p_to = 'pending' then
    perform public.post_wallet_ledger(
      p_idempotency_key || ':escrow_pending',
      v_escrow.requester_id,
      p_request_id,
      'escrow_pending',
      0,
      -v_escrow.total,
      v_escrow.total
    );

    update public.request_escrow
    set escrow_bucket = 'pending'
    where request_id = p_request_id;
  elsif p_from = 'pending' and p_to = 'released' then
    if v_provider_id is null then
      raise exception 'cannot release escrow without a provider' using errcode = '55000';
    end if;

    perform public.post_wallet_ledger(
      p_idempotency_key || ':escrow_release',
      v_escrow.requester_id,
      p_request_id,
      'escrow_release',
      0,
      0,
      -v_escrow.total
    );

    perform public.post_wallet_ledger(
      p_idempotency_key || ':pay_provider',
      v_provider_id,
      p_request_id,
      'pay_provider',
      v_escrow.provider_amount,
      0,
      0
    );

    perform public.post_wallet_ledger(
      p_idempotency_key || ':service_fee',
      null,
      p_request_id,
      'service_fee',
      0,
      0,
      0,
      v_escrow.service_fee
    );
  elsif p_from = 'locked' and p_to = 'refunded' then
    perform public.post_wallet_ledger(
      p_idempotency_key || ':refund',
      v_escrow.requester_id,
      p_request_id,
      'refund',
      v_escrow.total,
      -v_escrow.total,
      0
    );
  elsif p_from = 'pending' and p_to = 'refunded' then
    perform public.post_wallet_ledger(
      p_idempotency_key || ':refund',
      v_escrow.requester_id,
      p_request_id,
      'refund',
      v_escrow.total,
      0,
      -v_escrow.total
    );
  elsif p_from = 'disputed' and p_to = 'released' then
    if v_provider_id is null then
      raise exception 'cannot release escrow without a provider' using errcode = '55000';
    end if;

    if v_escrow.escrow_bucket = 'pending' then
      perform public.post_wallet_ledger(
        p_idempotency_key || ':escrow_release',
        v_escrow.requester_id,
        p_request_id,
        'escrow_release',
        0,
        0,
        -v_escrow.total
      );
    else
      perform public.post_wallet_ledger(
        p_idempotency_key || ':escrow_release',
        v_escrow.requester_id,
        p_request_id,
        'escrow_release',
        0,
        -v_escrow.total,
        0
      );
    end if;

    perform public.post_wallet_ledger(
      p_idempotency_key || ':pay_provider',
      v_provider_id,
      p_request_id,
      'pay_provider',
      v_escrow.provider_amount,
      0,
      0
    );

    perform public.post_wallet_ledger(
      p_idempotency_key || ':service_fee',
      null,
      p_request_id,
      'service_fee',
      0,
      0,
      0,
      v_escrow.service_fee
    );
  elsif p_from = 'disputed' and p_to = 'refunded' then
    if v_escrow.escrow_bucket = 'pending' then
      perform public.post_wallet_ledger(
        p_idempotency_key || ':refund',
        v_escrow.requester_id,
        p_request_id,
        'refund',
        v_escrow.total,
        0,
        -v_escrow.total
      );
    else
      perform public.post_wallet_ledger(
        p_idempotency_key || ':refund',
        v_escrow.requester_id,
        p_request_id,
        'refund',
        v_escrow.total,
        -v_escrow.total,
        0
      );
    end if;
  elsif p_from = 'disputed' and p_to = 'pending' then
    if v_escrow.escrow_bucket = 'locked' then
      perform public.post_wallet_ledger(
        p_idempotency_key || ':escrow_pending',
        v_escrow.requester_id,
        p_request_id,
        'escrow_pending',
        0,
        -v_escrow.total,
        v_escrow.total
      );

      update public.request_escrow
      set escrow_bucket = 'pending'
      where request_id = p_request_id;
    end if;
  elsif p_from = 'disputed' and p_to = 'locked' then
    if v_escrow.escrow_bucket = 'pending' then
      perform public.post_wallet_ledger(
        p_idempotency_key || ':escrow_relock',
        v_escrow.requester_id,
        p_request_id,
        'escrow_relock',
        0,
        v_escrow.total,
        -v_escrow.total
      );

      update public.request_escrow
      set escrow_bucket = 'locked'
      where request_id = p_request_id;
    end if;
  end if;
end;
$$;

revoke all on function public.sync_wallet_payment_transition(
  uuid, public.payment_status, public.payment_status, text
) from public, anon, authenticated;

create or replace function public.apply_payment_transition(
  p_request_id uuid,
  p_to_status public.payment_status,
  p_idempotency_key text
)
returns public.payment_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.payment_status;
  v_allowed boolean;
  v_existing public.payment_status;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  select pt.to_status into v_existing
  from public.payment_transitions pt
  where pt.request_id = p_request_id
    and pt.idempotency_key = p_idempotency_key;

  if v_existing is not null then
    return v_existing;
  end if;

  select payment_status into v_from
  from public.requests
  where id = p_request_id
  for update;

  if v_from is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  v_allowed := case
    when v_from = 'not_required' and p_to_status = 'not_required' then true
    when v_from = 'available' and p_to_status in ('locked', 'not_required') then true
    when v_from = 'not_required' and p_to_status = 'locked' then true
    when v_from = 'locked' and p_to_status in ('pending', 'refunded', 'disputed') then true
    when v_from = 'pending' and p_to_status in ('released', 'refunded', 'disputed') then true
    when v_from = 'released' and p_to_status = 'disputed' then true
    when v_from = 'refunded' and p_to_status = 'disputed' then true
    when v_from = 'disputed' and p_to_status in ('released', 'refunded', 'pending', 'locked') then true
    else false
  end;

  if not v_allowed then
    raise exception 'payment cannot move from % to %', v_from, p_to_status using errcode = '55000';
  end if;

  perform public.sync_wallet_payment_transition(
    p_request_id,
    v_from,
    p_to_status,
    p_idempotency_key
  );

  insert into public.payment_transitions (request_id, idempotency_key, from_status, to_status)
  values (p_request_id, p_idempotency_key, v_from, p_to_status);

  update public.requests
  set payment_status = p_to_status
  where id = p_request_id;

  return p_to_status;
end;
$$;

create or replace function public.create_request(
  p_category_slug text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_label text,
  p_search_radius_m integer,
  p_scheduled_for timestamptz default null,
  p_offered_amount numeric default null,
  p_category_data jsonb default '{}'::jsonb,
  p_source_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := public.assert_onboarded();
  v_location extensions.geography := public.assert_coordinates(p_latitude, p_longitude);
  v_request_id uuid;
  v_payment public.payment_status;
  v_source public.requests%rowtype;
  v_charge record;
begin
  if not exists (
    select 1 from public.service_categories
    where slug = p_category_slug and is_active
  ) then
    raise exception 'unknown service category' using errcode = '22023';
  end if;

  if p_search_radius_m not between 1000 and 50000 then
    raise exception 'search radius must be between 1 km and 50 km' using errcode = '22023';
  end if;

  if p_scheduled_for is not null and p_scheduled_for < now() - interval '5 minutes' then
    raise exception 'scheduled time is in the past' using errcode = '22023';
  end if;

  if p_scheduled_for is not null and p_scheduled_for > now() + interval '30 days' then
    raise exception 'scheduled time is too far in the future' using errcode = '22023';
  end if;

  if jsonb_typeof(p_category_data) is distinct from 'object' then
    raise exception 'category data must be a JSON object' using errcode = '22023';
  end if;

  if p_source_request_id is not null then
    select * into v_source
    from public.requests
    where id = p_source_request_id and requester_id = v_user_id;

    if v_source.id is null then
      raise exception 'source request not found' using errcode = 'P0002';
    end if;

    if not (
      v_source.status = 'completed'
      or v_source.status = 'expired'
      or (v_source.status = 'searching' and v_source.expires_at <= now())
    ) then
      raise exception 'only expired or completed requests can be reused' using errcode = '55000';
    end if;
  end if;

  if (
    select count(*) from public.requests
    where requester_id = v_user_id
      and (
        status in ('accepted', 'in_progress', 'completion_pending')
        or (status = 'searching' and expires_at > now())
      )
  ) >= 5 then
    raise exception 'you already have 5 open requests' using errcode = '55000';
  end if;

  if p_offered_amount is not null and p_offered_amount > 0 then
    select * into v_charge from public.compute_request_charge(p_offered_amount);

    perform public.ensure_wallet_account(v_user_id);

    if (
      select wa.available
      from public.wallet_accounts wa
      where wa.user_id = v_user_id
    ) < v_charge.total then
      raise exception 'insufficient wallet balance to fund this request' using errcode = '55000';
    end if;

    v_payment := 'not_required';
  else
    v_payment := 'not_required';
  end if;

  insert into public.requests (
    requester_id,
    category_slug,
    description,
    category_data,
    scheduled_for,
    offered_amount,
    payment_status,
    location,
    location_label,
    search_radius_m,
    status,
    submitted_at,
    expires_at,
    source_request_id
  )
  values (
    v_user_id,
    p_category_slug,
    btrim(p_description),
    p_category_data,
    p_scheduled_for,
    p_offered_amount,
    v_payment,
    v_location,
    btrim(p_location_label),
    p_search_radius_m,
    'searching',
    now(),
    coalesce(p_scheduled_for, now()) + interval '24 hours',
    p_source_request_id
  )
  returning id into v_request_id;

  if p_offered_amount is not null and p_offered_amount > 0 then
    perform public.lock_request_escrow(v_request_id, 'create:' || v_request_id::text);
  end if;

  return v_request_id;
end;
$$;

revoke execute on function public.create_request(
  text, text, double precision, double precision, text, integer, timestamptz, numeric, jsonb, uuid
) from public, anon;
grant execute on function public.create_request(
  text, text, double precision, double precision, text, integer, timestamptz, numeric, jsonb, uuid
) to authenticated;

create view public.my_wallet
with (security_invoker = on) as
select
  wa.user_id,
  wa.available,
  wa.locked,
  wa.pending,
  wa.currency,
  wa.updated_at
from public.wallet_accounts wa
where wa.user_id = (select auth.uid());

revoke all on public.my_wallet from public, anon;
grant select on public.my_wallet to authenticated;

-- Backfill wallet shells for existing profiles.
insert into public.wallet_accounts (user_id)
select p.id from public.profiles p
on conflict (user_id) do nothing;
