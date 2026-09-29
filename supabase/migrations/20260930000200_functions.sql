-- Active schema (split from squashed baseline for reviewability).
-- Fresh environments: supabase db reset. After drift: squash again if needed.

-- Public functions (RPC, guards, notifications).
-- pg_dump order: functions before tables; defer body validation until tables exist.
SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION "public"."accept_response"("p_response_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_request_id uuid;
  v_selected_user_id uuid;
  v_request_status public.request_status;
  v_response_status public.response_status;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_request_expires_at timestamptz;
  v_offered_amount numeric;
  v_quoted_amount numeric;
  v_agreed_provider_amount numeric;
  v_attending uuid;
  v_accepted uuid;
  v_locked_request_id uuid;
begin
  select rr.request_id
    into v_request_id
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  where rr.id = p_response_id
    and r.requester_id = v_user_id;

  if v_request_id is null then
    raise exception 'response not found' using errcode = 'P0002';
  end if;

  select r.status, r.payment_status, r.requester_id, r.expires_at, r.offered_amount
    into v_request_status, v_payment, v_requester_id, v_request_expires_at, v_offered_amount
  from public.requests r
  where r.id = v_request_id
  for update;

  if exists (select 1 from public.handshakes h where h.request_id = v_request_id) then
    raise exception 'someone is already helping on this request' using errcode = '55000';
  end if;

  if v_request_status <> 'posted' then
    raise exception 'this request is no longer open for selection' using errcode = '55000';
  end if;

  if v_request_expires_at <= now() then
    raise exception 'this request is no longer open for selection' using errcode = '55000';
  end if;

  select rr.request_id, rr.responder_id, rr.status, rr.quoted_amount
    into v_locked_request_id, v_selected_user_id, v_response_status, v_quoted_amount
  from public.request_responses rr
  where rr.id = p_response_id
  for update;

  if v_locked_request_id is distinct from v_request_id
     or v_response_status is distinct from 'pending' then
    raise exception 'this response is no longer available' using errcode = '55000';
  end if;

  v_agreed_provider_amount := coalesce(nullif(v_quoted_amount, 0), v_offered_amount);

  if v_agreed_provider_amount is null or v_agreed_provider_amount <= 0 then
    raise exception 'this request has no agreed payment amount' using errcode = '55000';
  end if;

  select ua.request_id into v_attending
  from public.user_attendance ua
  where ua.user_id = v_selected_user_id
  for update;

  if v_attending is not null then
    raise exception 'This person is currently attending to another request.' using errcode = '55000';
  end if;

  update public.request_responses
  set status = 'accepted', resolved_at = now()
  where id = p_response_id
    and status = 'pending'
  returning id into v_accepted;

  if v_accepted is null then
    raise exception 'this response is no longer available' using errcode = '55000';
  end if;

  update public.request_responses
  set status = 'declined', resolved_at = now()
  where request_id = v_request_id
    and id <> p_response_id
    and status = 'pending';

  update public.requests
  set status = 'accepted',
      accepted_at = now(),
      accepted_response_id = p_response_id,
      selected_user_id = v_selected_user_id,
      agreed_provider_amount = v_agreed_provider_amount
  where id = v_request_id
    and status = 'posted';

  if not found then
    raise exception 'this request is no longer open for selection' using errcode = '55000';
  end if;

  perform public.set_user_attendance(v_selected_user_id, v_request_id);

  insert into public.handshakes (request_id, response_id, requester_id, selected_user_id)
  values (v_request_id, p_response_id, v_requester_id, v_selected_user_id);

  if v_payment = 'locked' then
    perform public.align_request_escrow_to_agreed_amount(
      v_request_id,
      v_agreed_provider_amount,
      'handshake:' || v_request_id::text
    );

    perform public.apply_payment_transition(
      v_request_id,
      'pending'::public.payment_status,
      'handshake:' || v_request_id::text
    );
  end if;

  perform public.notify_responders_not_chosen(v_request_id, p_response_id);

  return v_request_id;
end;
$$;


ALTER FUNCTION "public"."accept_response"("p_response_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_resolve_service_problem"("p_problem_id" "uuid", "p_outcome" "text", "p_admin_note" "text", "p_idempotency_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_existing public.dispute_admin_resolutions%rowtype;
  v_problem public.service_problems%rowtype;
  v_status public.request_status;
  v_payment public.payment_status;
  v_selected_user_id uuid;
  v_requester_id uuid;
  v_resolution text;
  v_request_after public.request_status;
  v_payment_after public.payment_status;
  v_push_title text;
  v_push_body text;
begin
  perform public.assert_admin_caller();

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if p_admin_note is null or btrim(p_admin_note) = '' then
    raise exception 'an admin note is required' using errcode = '22023';
  end if;

  if p_outcome not in ('refund_requester', 'pay_provider', 'resume_service') then
    raise exception 'unsupported admin outcome' using errcode = '22023';
  end if;

  select *
    into v_existing
  from public.dispute_admin_resolutions dar
  where dar.idempotency_key = p_idempotency_key;

  if v_existing.id is not null then
    return;
  end if;

  select sp.*
    into v_problem
  from public.service_problems sp
  where sp.id = p_problem_id
  for update;

  if v_problem.id is null or v_problem.status <> 'open' then
    raise exception 'there is no open dispute on this problem' using errcode = '55000';
  end if;

  select r.status, r.payment_status, r.selected_user_id, r.requester_id
    into v_status, v_payment, v_selected_user_id, v_requester_id
  from public.requests r
  where r.id = v_problem.request_id
  for update;

  if v_status <> 'disputed' then
    raise exception 'request is not disputed' using errcode = '55000';
  end if;

  if p_outcome = 'refund_requester' then
    v_resolution := 'admin_refund_requester';

    update public.request_responses
    set status = case
                   when status = 'accepted' then 'declined'::public.response_status
                   else 'expired'::public.response_status
                 end,
        resolved_at = coalesce(resolved_at, now())
    where request_id = v_problem.request_id
      and status in ('pending', 'accepted');

    update public.requests
    set status = 'cancelled',
        cancelled_at = now(),
        selected_user_id = null,
        accepted_response_id = null,
        completion_confirm_by = null
    where id = v_problem.request_id;

    perform public.record_request_status_event(
      v_problem.request_id,
      v_problem.reported_by,
      v_status,
      'cancelled',
      'admin_dispute:' || p_idempotency_key
    );

    if v_payment in ('locked', 'pending', 'disputed') then
      perform public.apply_payment_transition(
        v_problem.request_id,
        'refunded',
        'admin_dispute_refund:' || p_idempotency_key
      );
    end if;

    if v_selected_user_id is not null then
      perform public.release_provider(v_selected_user_id);
    end if;

    v_request_after := 'cancelled';
    v_payment_after := case
      when v_payment in ('locked', 'pending', 'disputed') then 'refunded'::public.payment_status
      else v_payment
    end;
    v_push_title := 'Dispute update';
    v_push_body := 'Your payment has been returned to your wallet.';
  elsif p_outcome = 'pay_provider' then
    v_resolution := 'admin_pay_provider';

    update public.requests
    set status = 'completed',
        completed_at = now(),
        started_at = coalesce(started_at, now()),
        completion_confirm_by = null
    where id = v_problem.request_id;

    perform public.record_request_status_event(
      v_problem.request_id,
      v_problem.reported_by,
      v_status,
      'completed',
      'admin_dispute:' || p_idempotency_key
    );

    if v_payment in ('locked', 'pending', 'disputed') then
      perform public.apply_payment_transition(
        v_problem.request_id,
        'released',
        'admin_dispute_release:' || p_idempotency_key
      );
    end if;

    update public.profiles
    set jobs_completed = jobs_completed + 1
    where id = v_selected_user_id;

    update public.profiles
    set requests_completed = requests_completed + 1
    where id = v_requester_id;

    if v_selected_user_id is not null then
      perform public.release_provider(v_selected_user_id);
    end if;

    v_request_after := 'completed';
    v_payment_after := case
      when v_payment in ('locked', 'pending', 'disputed') then 'released'::public.payment_status
      else v_payment
    end;
    v_push_title := 'Payment released';
    v_push_body := 'Your payment has been released after the dispute was resolved.';
  else
    v_resolution := 'admin_resume_service';

    update public.requests
    set status = v_problem.status_before,
        completion_confirm_by = case
          when v_problem.status_before = 'completion_pending'::public.request_status
            then now() + public.completion_confirmation_interval()
          else null
        end
    where id = v_problem.request_id;

    perform public.record_request_status_event(
      v_problem.request_id,
      v_problem.reported_by,
      v_status,
      v_problem.status_before,
      'admin_dispute:' || p_idempotency_key
    );

    if v_problem.payment_before in ('locked', 'pending')
       and v_payment = 'disputed' then
      perform public.apply_payment_transition(
        v_problem.request_id,
        v_problem.payment_before,
        'admin_dispute_resume:' || p_idempotency_key
      );
      v_payment_after := v_problem.payment_before;
    else
      v_payment_after := v_payment;
    end if;

    v_request_after := v_problem.status_before;
    v_push_title := 'Dispute update';
    v_push_body := 'The dispute was reviewed. You can continue with this request.';
  end if;

  update public.service_problems
  set status = 'resolved',
      resolution = v_resolution,
      resolved_at = now()
  where id = v_problem.id;

  insert into public.dispute_admin_resolutions (
    service_problem_id,
    request_id,
    outcome,
    admin_note,
    idempotency_key,
    request_status_after,
    payment_status_after
  )
  values (
    v_problem.id,
    v_problem.request_id,
    p_outcome,
    btrim(p_admin_note),
    p_idempotency_key,
    v_request_after,
    v_payment_after
  );

  perform public.send_push(
    array[v_requester_id],
    v_push_title,
    v_push_body,
    format('/engagement/%s', v_problem.request_id)
  );

  if v_selected_user_id is not null then
    perform public.send_push(
      array[v_selected_user_id],
      v_push_title,
      v_push_body,
      format('/engagement/%s', v_problem.request_id)
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."admin_resolve_service_problem"("p_problem_id" "uuid", "p_outcome" "text", "p_admin_note" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."align_request_escrow_to_agreed_amount"("p_request_id" "uuid", "p_agreed_provider_amount" numeric, "p_idempotency_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_escrow public.request_escrow%rowtype;
  v_new_charge record;
  v_delta_total numeric;
  v_requester_id uuid;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if p_agreed_provider_amount is null or p_agreed_provider_amount <= 0 then
    raise exception 'agreed amount must be positive' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.wallet_ledger wl
    where wl.idempotency_key = p_idempotency_key || ':align'
  ) then
    return;
  end if;

  select * into v_escrow
  from public.request_escrow re
  where re.request_id = p_request_id
  for update;

  if v_escrow.request_id is null then
    return;
  end if;

  if v_escrow.provider_amount = p_agreed_provider_amount then
    return;
  end if;

  select * into v_new_charge from public.compute_request_charge(p_agreed_provider_amount);

  v_delta_total := v_new_charge.total - v_escrow.total;
  v_requester_id := v_escrow.requester_id;

  if v_delta_total > 0 then
    perform public.ensure_wallet_account(v_requester_id);

    if (
      select wa.available
      from public.wallet_accounts wa
      where wa.user_id = v_requester_id
    ) < v_delta_total then
      raise exception 'insufficient wallet balance to accept this offer' using errcode = '55000';
    end if;

    perform public.post_wallet_ledger(
      p_idempotency_key || ':align',
      v_requester_id,
      p_request_id,
      'escrow_top_up',
      -v_delta_total,
      v_delta_total,
      0
    );
  elsif v_delta_total < 0 then
    perform public.post_wallet_ledger(
      p_idempotency_key || ':align',
      v_requester_id,
      p_request_id,
      'escrow_partial_refund',
      -v_delta_total,
      v_delta_total,
      0
    );
  end if;

  update public.request_escrow
  set provider_amount = v_new_charge.provider_amount,
      service_fee = v_new_charge.service_fee,
      total = v_new_charge.total
  where request_id = p_request_id;
end;
$$;


ALTER FUNCTION "public"."align_request_escrow_to_agreed_amount"("p_request_id" "uuid", "p_agreed_provider_amount" numeric, "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_payment_transition"("p_request_id" "uuid", "p_to_status" "public"."payment_status", "p_idempotency_key" "text") RETURNS "public"."payment_status"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."apply_payment_transition"("p_request_id" "uuid", "p_to_status" "public"."payment_status", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_rating_to_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.profiles p
  set rating_count = agg.count,
      rating_average = agg.average
  from (
    select count(*)::integer as count, round(avg(stars), 2) as average
    from public.ratings
    where ratee_id = new.ratee_id
  ) agg
  where p.id = new.ratee_id;

  return new;
end;
$$;


ALTER FUNCTION "public"."apply_rating_to_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_admin_caller"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if session_user in ('postgres', 'supabase_admin', 'service_role') then
    return;
  end if;

  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return;
  end if;

  raise exception 'not authorized' using errcode = '42501';
end;
$$;


ALTER FUNCTION "public"."assert_admin_caller"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_authenticated"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return v_user_id;
end;
$$;


ALTER FUNCTION "public"."assert_authenticated"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_coordinates"("p_latitude" double precision, "p_longitude" double precision) RETURNS "extensions"."geography"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
begin
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'coordinates are out of range' using errcode = '22023';
  end if;

  return extensions.ST_SetSRID(extensions.ST_MakePoint(p_longitude, p_latitude), 4326)::extensions.geography;
end;
$$;


ALTER FUNCTION "public"."assert_coordinates"("p_latitude" double precision, "p_longitude" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_dispute_evidence_paths"("p_reporter_id" "uuid", "p_paths" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare
  v_path text;
  v_prefix text := p_reporter_id::text || '/';
begin
  if p_paths is null then
    return;
  end if;

  if coalesce(array_length(p_paths, 1), 0) > 4 then
    raise exception 'at most four evidence photos are allowed' using errcode = '22023';
  end if;

  foreach v_path in array p_paths loop
    if v_path is null or btrim(v_path) = '' then
      raise exception 'evidence path cannot be empty' using errcode = '22023';
    end if;

    if not (v_path like v_prefix || '%') then
      raise exception 'evidence must be uploaded by the reporter' using errcode = '55000';
    end if;
  end loop;
end;
$$;


ALTER FUNCTION "public"."assert_dispute_evidence_paths"("p_reporter_id" "uuid", "p_paths" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assert_onboarded"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
begin
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and display_name is not null
  ) then
    raise exception 'finish setting up your profile first' using errcode = '42501';
  end if;

  return v_user_id;
end;
$$;


ALTER FUNCTION "public"."assert_onboarded"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."attending_request_statuses"() RETURNS "public"."request_status"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select array[
    'accepted',
    'in_progress',
    'completion_pending',
    'disputed'
  ]::public.request_status[];
$$;


ALTER FUNCTION "public"."attending_request_statuses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_complete_due_requests"("p_limit" integer DEFAULT 100) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_request_id uuid;
  v_completed_count integer := 0;
begin
  if p_limit < 1 then
    raise exception 'limit must be at least 1' using errcode = '22023';
  end if;

  for v_request_id in
    select r.id
    from public.requests r
    where r.status = 'completion_pending'::public.request_status
      and r.completion_confirm_by is not null
      and r.completion_confirm_by <= now()
      and r.payment_status <> 'disputed'::public.payment_status
    order by r.completion_confirm_by
    limit p_limit
    for update skip locked
  loop
    if public.auto_complete_request(v_request_id) then
      v_completed_count := v_completed_count + 1;
    end if;
  end loop;

  return v_completed_count;
end;
$$;


ALTER FUNCTION "public"."auto_complete_due_requests"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_complete_request"("p_request_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_status public.request_status;
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_confirm_by timestamptz;
  v_payment public.payment_status;
  v_requester_name text;
  v_requester_first text;
  v_finalized boolean;
begin
  select r.status, r.requester_id, r.selected_user_id, r.completion_confirm_by, r.payment_status
    into v_status, v_requester_id, v_selected_user_id, v_confirm_by, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'completed' then
    return false;
  end if;

  if v_status <> 'completion_pending' or v_payment = 'disputed' then
    return false;
  end if;

  if v_confirm_by is null or v_confirm_by > now() then
    return false;
  end if;

  v_finalized := public.finalize_request_completion(
    p_request_id,
    v_requester_id,
    'auto_complete:' || p_request_id::text
  );

  if not v_finalized then
    return false;
  end if;

  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = v_requester_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'The requester');

  perform public.send_push(
    array[v_requester_id],
    'Request completed',
    'The confirmation window ended, so this request was marked complete. You can still leave a rating.',
    format('/rate/%s', p_request_id)
  );

  if v_selected_user_id is not null then
    perform public.send_push(
      array[v_selected_user_id],
      'Payment released',
      format(
        '%s did not confirm in time. The request was completed automatically and your payment has been released.',
        v_requester_first
      ),
      format('/engagement/%s', p_request_id)
    );
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."auto_complete_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."avatar_is_published"("p_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.profiles p where p.avatar_path = p_name
  );
$$;


ALTER FUNCTION "public"."avatar_is_published"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."browse_nearby_requests"("p_latitude" double precision, "p_longitude" double precision) RETURNS TABLE("request_id" "uuid", "title" "text", "description" "text", "scheduled_for" timestamp with time zone, "offered_amount" numeric, "currency" "text", "location_label" "text", "distance_m" integer, "requester_display_name" "text", "requester_avatar_path" "text", "requester_rating_average" numeric, "requester_rating_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with viewer as (
    select
      public.assert_onboarded() as user_id,
      public.assert_coordinates(p_latitude, p_longitude) as location
  )
  select
    r.id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(extensions.ST_Distance(r.location, viewer.location)),
    p.display_name,
    p.avatar_path,
    p.rating_average,
    p.rating_count
  from viewer
  join public.requests r
    on r.status = 'posted'
   and r.expires_at > now()
   and r.offered_amount is not null
   and r.offered_amount > 0
   and r.payment_status = 'locked'::public.payment_status
   and r.requester_id <> viewer.user_id
   and extensions.ST_DWithin(r.location, viewer.location, public.discovery_radius_m())
   and not exists (
     select 1 from public.request_responses rr
     where rr.request_id = r.id
       and rr.responder_id = viewer.user_id
       and rr.status = 'declined'
   )
  join public.profiles p on p.id = r.requester_id
  order by extensions.ST_Distance(r.location, viewer.location) asc, r.created_at desc
  limit 40;
$$;


ALTER FUNCTION "public"."browse_nearby_requests"("p_latitude" double precision, "p_longitude" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."browse_request"("p_request_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) RETURNS TABLE("request_id" "uuid", "title" "text", "description" "text", "scheduled_for" timestamp with time zone, "offered_amount" numeric, "currency" "text", "location_label" "text", "distance_m" integer, "requester_display_name" "text", "requester_avatar_path" "text", "requester_rating_average" numeric, "requester_rating_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with viewer as (
    select
      public.assert_onboarded() as user_id,
      public.assert_coordinates(p_latitude, p_longitude) as location
  )
  select
    r.id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    r.location_label,
    public.bucket_distance_m(extensions.ST_Distance(r.location, viewer.location)),
    p.display_name,
    p.avatar_path,
    p.rating_average,
    p.rating_count
  from viewer
  join public.requests r
    on r.id = p_request_id
   and r.status = 'posted'
   and r.expires_at > now()
   and r.offered_amount is not null
   and r.offered_amount > 0
   and r.payment_status = 'locked'::public.payment_status
   and r.requester_id <> viewer.user_id
   and extensions.ST_DWithin(r.location, viewer.location, public.discovery_radius_m())
  join public.profiles p on p.id = r.requester_id;
$$;


ALTER FUNCTION "public"."browse_request"("p_request_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bucket_distance_m"("p_distance_m" double precision) RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select greatest(100, (round(p_distance_m / 100.0) * 100))::integer;
$$;


ALTER FUNCTION "public"."bucket_distance_m"("p_distance_m" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_request_media"("p_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    (storage.foldername(p_name))[1] = (select auth.uid())::text
    or public.request_media_visible_to_party((select auth.uid()), p_name);
$$;


ALTER FUNCTION "public"."can_read_request_media"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_request"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_requester_id uuid;
  v_status public.request_status;
begin
  select r.requester_id, r.status
    into v_requester_id, v_status
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_requester_id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_requester_id <> v_user_id then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'completion_pending' then
    raise exception 'you cannot cancel while completion is being confirmed'
      using errcode = '55000';
  end if;

  perform public.finalize_request_cancellation(
    p_request_id,
    v_user_id,
    'cancel_request:' || p_request_id::text,
    'cancel:' || p_request_id::text
  );
end;
$$;


ALTER FUNCTION "public"."cancel_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_service"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_selected_user_id uuid;
  v_status public.request_status;
begin
  select r.selected_user_id, r.status
    into v_selected_user_id, v_status
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_selected_user_id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_selected_user_id <> v_user_id then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status not in ('accepted', 'in_progress', 'completion_pending') then
    raise exception 'only an active service can be cancelled by the provider' using errcode = '55000';
  end if;

  perform public.finalize_request_cancellation(
    p_request_id,
    v_user_id,
    'cancel_service:' || p_request_id::text,
    'cancel:' || p_request_id::text
  );
end;
$$;


ALTER FUNCTION "public"."cancel_service"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."catalogue_media_is_published"("p_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.profile_catalogue_media m
    where m.storage_path = p_name
  );
$$;


ALTER FUNCTION "public"."catalogue_media_is_published"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_user_attendance"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.user_attendance
  set request_id = null
  where user_id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."clear_user_attendance"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clone_request_from_prior"("p_source_request_id" "uuid", "p_idempotency_key" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_onboarded();
  v_source public.requests%rowtype;
  v_clone_id uuid;
  v_existing uuid;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  select io.request_id into v_existing
  from public.idempotent_operations io
  where io.key = p_idempotency_key;

  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_source
  from public.requests
  where id = p_source_request_id and requester_id = v_user_id;

  if v_source.id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if not (
    v_source.status = 'completed'
    or v_source.status = 'expired'
    or (v_source.status = 'searching' and v_source.expires_at <= now())
  ) then
    raise exception 'only expired or completed requests can be reused' using errcode = '55000';
  end if;

  v_clone_id := public.create_request(
    v_source.category_slug,
    v_source.description,
    extensions.ST_Y(v_source.location::extensions.geometry),
    extensions.ST_X(v_source.location::extensions.geometry),
    v_source.location_label,
    v_source.search_radius_m,
    v_source.scheduled_for,
    v_source.offered_amount,
    v_source.category_data
  );

  update public.requests
  set source_request_id = p_source_request_id
  where id = v_clone_id;

  insert into public.idempotent_operations (key, operation, request_id)
  values (p_idempotency_key, 'clone_request_from_prior', v_clone_id);

  return v_clone_id;
end;
$$;


ALTER FUNCTION "public"."clone_request_from_prior"("p_source_request_id" "uuid", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_request"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_status public.request_status;
  v_payment public.payment_status;
begin
  select status, payment_status
    into v_status, v_payment
  from public.requests
  where id = p_request_id and requester_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'completed' then
    return;
  end if;

  if v_payment = 'disputed' then
    raise exception 'disputed funds cannot be released through completion'
      using errcode = '55000';
  end if;

  if v_status <> 'completion_pending' then
    raise exception 'you can confirm completion only after your helper marks the request complete'
      using errcode = '55000';
  end if;

  if not public.finalize_request_completion(
    p_request_id,
    v_user_id,
    'confirm_complete:' || p_request_id::text
  ) then
    raise exception 'disputed funds cannot be released through completion'
      using errcode = '55000';
  end if;
end;
$$;


ALTER FUNCTION "public"."complete_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."completion_confirmation_interval"() RETURNS interval
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select interval '72 hours';
$$;


ALTER FUNCTION "public"."completion_confirmation_interval"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_request_charge"("p_provider_amount" numeric) RETURNS TABLE("provider_amount" numeric, "service_fee" numeric, "total" numeric)
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select
    p_provider_amount as provider_amount,
    round(p_provider_amount * 0.1, 0) as service_fee,
    p_provider_amount + round(p_provider_amount * 0.1, 0) as total;
$$;


ALTER FUNCTION "public"."compute_request_charge"("p_provider_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_avatar_capture"("p_storage_path" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
begin
  if p_storage_path is null or btrim(p_storage_path) = '' then
    raise exception 'storage path is required' using errcode = '22023';
  end if;

  if (storage.foldername(p_storage_path))[1] is distinct from v_user_id::text then
    raise exception 'avatar path must live under your user folder' using errcode = '42501';
  end if;

  update public.profiles
  set avatar_path = p_storage_path,
      avatar_captured_in_app = true
  where id = v_user_id;
end;
$$;


ALTER FUNCTION "public"."confirm_avatar_capture"("p_storage_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contest_service_problem"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_requester_id uuid;
  v_provider_id uuid;
  v_status public.request_status;
  v_problem public.service_problems%rowtype;
begin
  select r.requester_id, r.selected_user_id, r.status
    into v_requester_id, v_provider_id, v_status
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_requester_id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_user_id not in (v_requester_id, v_provider_id) then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status <> 'disputed' then
    raise exception 'there is no open problem on this request' using errcode = '55000';
  end if;

  select *
    into v_problem
  from public.service_problems sp
  where sp.request_id = p_request_id
    and sp.status = 'open'
  for update;

  if not found then
    raise exception 'there is no open problem on this request' using errcode = '55000';
  end if;

  if v_problem.reported_by = v_user_id then
    raise exception 'you cannot respond to your own report' using errcode = '55000';
  end if;

  if v_problem.respond_by is not null and v_problem.respond_by <= now() then
    raise exception 'the response window has closed' using errcode = '55000';
  end if;

  update public.service_problems
  set status = 'resolved',
      resolution = 'contested',
      resolved_at = now()
  where id = v_problem.id;

  update public.requests
  set status = v_problem.status_before,
      completion_confirm_by = case
        when v_problem.status_before = 'completion_pending'::public.request_status
          then now() + public.completion_confirmation_interval()
        else null
      end
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_user_id,
    'disputed',
    v_problem.status_before,
    'contest_problem:' || p_request_id::text
  );

  if v_problem.payment_before in ('locked', 'pending')
     and exists (
       select 1
       from public.requests r
       where r.id = p_request_id
         and r.payment_status = 'disputed'
     ) then
    perform public.apply_payment_transition(
      p_request_id,
      v_problem.payment_before,
      'contest_problem:' || p_request_id::text
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."contest_service_problem"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_available_responses"("p_request_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select count(*)::integer
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  where rr.request_id = p_request_id
    and r.requester_id = (select auth.uid())
    and rr.status = 'pending';
$$;


ALTER FUNCTION "public"."count_available_responses"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_request"("p_title" "text", "p_description" "text", "p_latitude" double precision, "p_longitude" double precision, "p_location_label" "text", "p_scheduled_for" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_offered_amount" numeric DEFAULT NULL::numeric, "p_source_request_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_onboarded();
  v_location extensions.geography := public.assert_coordinates(p_latitude, p_longitude);
  v_request_id uuid;
  v_payment public.payment_status;
  v_source public.requests%rowtype;
  v_charge record;
begin
  if char_length(btrim(p_title)) < 3 or char_length(btrim(p_title)) > 120 then
    raise exception 'title must be between 3 and 120 characters' using errcode = '22023';
  end if;

  if p_description is not null and btrim(p_description) = '' then
    raise exception 'description cannot be blank' using errcode = '22023';
  end if;

  if p_offered_amount is null or p_offered_amount <= 0 then
    raise exception 'offer amount must be greater than zero' using errcode = '22023';
  end if;

  if p_scheduled_for is not null and p_scheduled_for < now() - interval '5 minutes' then
    raise exception 'scheduled time is in the past' using errcode = '22023';
  end if;

  if p_scheduled_for is not null and p_scheduled_for > now() + interval '30 days' then
    raise exception 'scheduled time is too far in the future' using errcode = '22023';
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
      or (v_source.status = 'posted' and v_source.expires_at <= now())
    ) then
      raise exception 'only expired or completed requests can be reused' using errcode = '55000';
    end if;
  end if;

  if (
    select count(*) from public.requests
    where requester_id = v_user_id
      and (
        status in ('accepted', 'in_progress', 'completion_pending')
        or (status = 'posted' and expires_at > now())
      )
  ) >= 5 then
    raise exception 'you already have 5 open requests' using errcode = '55000';
  end if;

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

  insert into public.requests (
    requester_id,
    title,
    description,
    scheduled_for,
    offered_amount,
    payment_status,
    location,
    location_label,
    status,
    submitted_at,
    expires_at,
    source_request_id
  )
  values (
    v_user_id,
    btrim(p_title),
    nullif(btrim(p_description), ''),
    p_scheduled_for,
    p_offered_amount,
    v_payment,
    v_location,
    btrim(p_location_label),
    'posted',
    now(),
    public.request_expires_at(p_scheduled_for),
    p_source_request_id
  )
  returning id into v_request_id;

  perform public.lock_request_escrow(v_request_id, 'create:' || v_request_id::text);

  return v_request_id;
end;
$$;


ALTER FUNCTION "public"."create_request"("p_title" "text", "p_description" "text", "p_latitude" double precision, "p_longitude" double precision, "p_location_label" "text", "p_scheduled_for" timestamp with time zone, "p_offered_amount" numeric, "p_source_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decline_response"("p_response_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_updated uuid;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'decline reason must be 500 characters or fewer' using errcode = '22023';
  end if;

  update public.request_responses rr
  set status = 'declined',
      resolved_at = now(),
      decline_reason = v_reason
  where rr.id = p_response_id
    and rr.status = 'pending'
    and exists (
      select 1 from public.requests r
      where r.id = rr.request_id and r.requester_id = v_user_id
    )
  returning rr.id into v_updated;

  if v_updated is null then
    raise exception 'this response is no longer pending' using errcode = '55000';
  end if;
end;
$$;


ALTER FUNCTION "public"."decline_response"("p_response_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."discovery_radius_m"() RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select 50000;
$$;


ALTER FUNCTION "public"."discovery_radius_m"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."display_first_name"("p_display_name" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select nullif(btrim(split_part(coalesce(p_display_name, ''), ' ', 1)), '');
$$;


ALTER FUNCTION "public"."display_first_name"("p_display_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_wallet_account"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.wallet_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
end;
$$;


ALTER FUNCTION "public"."ensure_wallet_account"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_due_requests"("p_limit" integer DEFAULT 100) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_request_id uuid;
  v_expired_count integer := 0;
begin
  if p_limit < 1 then
    raise exception 'limit must be at least 1' using errcode = '22023';
  end if;

  for v_request_id in
    select r.id
    from public.requests r
    where r.status = 'posted'::public.request_status
      and r.expires_at is not null
      and r.expires_at <= now()
      and not exists (select 1 from public.handshakes h where h.request_id = r.id)
    order by r.expires_at
    limit p_limit
    for update skip locked
  loop
    if public.expire_request(v_request_id) then
      v_expired_count := v_expired_count + 1;
    end if;
  end loop;

  return v_expired_count;
end;
$$;


ALTER FUNCTION "public"."expire_due_requests"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_request"("p_request_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_status public.request_status;
  v_from_status public.request_status;
  v_payment public.payment_status;
  v_expires_at timestamptz;
  v_requester_id uuid;
  v_responder_ids uuid[];
  v_responder_id uuid;
begin
  select r.status, r.payment_status, r.expires_at, r.requester_id
    into v_status, v_payment, v_expires_at, v_requester_id
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'expired' then
    return false;
  end if;

  if v_status <> 'posted' then
    return false;
  end if;

  if v_expires_at is null or v_expires_at > now() then
    return false;
  end if;

  if exists (select 1 from public.handshakes h where h.request_id = p_request_id) then
    return false;
  end if;

  v_from_status := v_status;

  select coalesce(array_agg(distinct rr.responder_id), '{}')
    into v_responder_ids
  from public.request_responses rr
  where rr.request_id = p_request_id
    and rr.status = 'pending';

  update public.request_responses
  set status = 'expired'::public.response_status,
      resolved_at = now()
  where request_id = p_request_id
    and status = 'pending';

  update public.requests
  set status = 'expired'::public.request_status
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_requester_id,
    v_from_status,
    'expired'::public.request_status,
    'expire:' || p_request_id::text
  );

  if v_payment = 'locked' then
    perform public.apply_payment_transition(
      p_request_id,
      'refunded'::public.payment_status,
      'expire:' || p_request_id::text
    );
  end if;

  perform public.send_push(
    array[v_requester_id],
    'Request expired',
    'This request expired before anyone was chosen. You can post it again.',
    format('/request/%s', p_request_id)
  );

  foreach v_responder_id in array v_responder_ids
  loop
    perform public.send_push(
      array[v_responder_id],
      'Request expired',
      'A request you responded to expired before anyone was chosen.',
      '/(tabs)/requests'
    );
  end loop;

  return true;
end;
$$;


ALTER FUNCTION "public"."expire_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_client_no_show_resolution"("p_request_id" "uuid", "p_actor_id" "uuid", "p_status_event_key" "text", "p_payment_idempotency_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_status public.request_status;
  v_provider_id uuid;
  v_payment public.payment_status;
begin
  if p_status_event_key is null or btrim(p_status_event_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if p_payment_idempotency_key is null or btrim(p_payment_idempotency_key) = '' then
    raise exception 'payment idempotency key is required' using errcode = '22023';
  end if;

  select r.status, r.selected_user_id, r.payment_status
    into v_status, v_provider_id, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'no_show' then
    return false;
  end if;

  if v_status <> 'disputed' then
    return false;
  end if;

  update public.requests
  set status = 'no_show',
      completion_confirm_by = null
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_status,
    'no_show',
    p_status_event_key
  );

  if v_payment in ('locked', 'pending', 'disputed') then
    perform public.apply_payment_transition(
      p_request_id,
      'released',
      p_payment_idempotency_key
    );
  end if;

  if v_provider_id is not null then
    perform public.release_provider(v_provider_id);
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."finalize_client_no_show_resolution"("p_request_id" "uuid", "p_actor_id" "uuid", "p_status_event_key" "text", "p_payment_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_provider_no_show_resolution"("p_request_id" "uuid", "p_actor_id" "uuid", "p_status_event_key" "text", "p_payment_idempotency_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_status public.request_status;
  v_provider_id uuid;
  v_payment public.payment_status;
begin
  if p_status_event_key is null or btrim(p_status_event_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if p_payment_idempotency_key is null or btrim(p_payment_idempotency_key) = '' then
    raise exception 'payment idempotency key is required' using errcode = '22023';
  end if;

  select r.status, r.selected_user_id, r.payment_status
    into v_status, v_provider_id, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'no_show' then
    return false;
  end if;

  if v_status <> 'disputed' then
    return false;
  end if;

  update public.request_responses
  set status = 'declined'::public.response_status,
      resolved_at = coalesce(resolved_at, now())
  where request_id = p_request_id
    and status = 'accepted';

  update public.requests
  set status = 'no_show',
      completion_confirm_by = null
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_status,
    'no_show',
    p_status_event_key
  );

  if v_payment in ('locked', 'pending', 'disputed') then
    perform public.apply_payment_transition(
      p_request_id,
      'refunded',
      p_payment_idempotency_key
    );
  end if;

  if v_provider_id is not null then
    perform public.release_provider(v_provider_id);
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."finalize_provider_no_show_resolution"("p_request_id" "uuid", "p_actor_id" "uuid", "p_status_event_key" "text", "p_payment_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_request_cancellation"("p_request_id" "uuid", "p_actor_id" "uuid", "p_status_event_key" "text", "p_payment_idempotency_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_status public.request_status;
  v_selected_user_id uuid;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_responder_ids uuid[];
  v_responder_id uuid;
begin
  if p_status_event_key is null or btrim(p_status_event_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if p_payment_idempotency_key is null or btrim(p_payment_idempotency_key) = '' then
    raise exception 'payment idempotency key is required' using errcode = '22023';
  end if;

  select r.status, r.selected_user_id, r.requester_id, r.payment_status
    into v_status, v_selected_user_id, v_requester_id, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'cancelled' then
    return false;
  end if;

  if v_status = 'completed' then
    raise exception 'a completed request cannot be cancelled' using errcode = '55000';
  end if;

  if v_status in ('expired', 'no_show', 'disputed') then
    raise exception 'a request cannot be cancelled once it is %', v_status using errcode = '55000';
  end if;

  if v_status not in ('draft', 'posted', 'accepted', 'in_progress', 'completion_pending') then
    raise exception 'a request cannot be cancelled once it is %', v_status using errcode = '55000';
  end if;

  if v_status = 'posted' then
    select coalesce(array_agg(distinct rr.responder_id), '{}')
      into v_responder_ids
    from public.request_responses rr
    where rr.request_id = p_request_id
      and rr.status = 'pending';
  end if;

  update public.request_responses
  set status = case
                 when status = 'accepted' then 'declined'::public.response_status
                 else 'expired'::public.response_status
               end,
      resolved_at = coalesce(resolved_at, now())
  where request_id = p_request_id
    and status in ('pending', 'accepted');

  update public.requests
  set status = 'cancelled',
      cancelled_at = now(),
      selected_user_id = null,
      accepted_response_id = null,
      completion_confirm_by = null
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_status,
    'cancelled'::public.request_status,
    p_status_event_key
  );

  if v_payment in ('locked', 'pending') then
    perform public.apply_payment_transition(
      p_request_id,
      'refunded'::public.payment_status,
      p_payment_idempotency_key
    );
  end if;

  if v_selected_user_id is not null then
    perform public.release_provider(v_selected_user_id);
  end if;

  if v_status = 'posted' and p_actor_id = v_requester_id then
    foreach v_responder_id in array v_responder_ids
    loop
      perform public.send_push(
        array[v_responder_id],
        'Request cancelled',
        'The person who posted this request cancelled it before anyone was chosen.',
        '/(tabs)/requests'
      );
    end loop;
  elsif p_actor_id = v_requester_id and v_selected_user_id is not null then
    perform public.send_push(
      array[v_selected_user_id],
      'Request cancelled',
      'The request was cancelled before it finished.',
      format('/engagement/%s', p_request_id)
    );
  elsif v_selected_user_id is not null and p_actor_id = v_selected_user_id then
    perform public.send_push(
      array[v_requester_id],
      'Request cancelled',
      'The person helping you cancelled. Any set-aside payment will be returned.',
      format('/engagement/%s', p_request_id)
    );
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."finalize_request_cancellation"("p_request_id" "uuid", "p_actor_id" "uuid", "p_status_event_key" "text", "p_payment_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_request_completion"("p_request_id" "uuid", "p_actor_id" "uuid", "p_status_event_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_status public.request_status;
  v_selected_user_id uuid;
  v_requester_id uuid;
  v_payment public.payment_status;
  v_requester_name text;
  v_requester_first text;
begin
  if p_status_event_key is null or btrim(p_status_event_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  select r.status, r.selected_user_id, r.requester_id, r.payment_status
    into v_status, v_selected_user_id, v_requester_id, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'completed' then
    return false;
  end if;

  if v_status <> 'completion_pending' or v_payment = 'disputed' then
    return false;
  end if;

  update public.requests
  set status = 'completed'::public.request_status,
      completed_at = now(),
      started_at = coalesce(started_at, now()),
      completion_confirm_by = null
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    p_actor_id,
    v_status,
    'completed'::public.request_status,
    p_status_event_key
  );

  if v_payment = 'pending' then
    perform public.apply_payment_transition(
      p_request_id,
      'released'::public.payment_status,
      'complete:' || p_request_id::text
    );
  end if;

  if v_selected_user_id is not null then
    update public.profiles
    set jobs_completed = jobs_completed + 1
    where id = v_selected_user_id;

    perform public.release_provider(v_selected_user_id);
  end if;

  update public.profiles
  set requests_completed = requests_completed + 1
  where id = v_requester_id;

  if p_status_event_key like 'confirm_complete:%' and v_selected_user_id is not null then
    select p.display_name into v_requester_name
    from public.profiles p
    where p.id = v_requester_id;

    v_requester_first := coalesce(public.display_first_name(v_requester_name), 'The requester');

    perform public.send_push(
      array[v_selected_user_id],
      'Payment released',
      format(
        '%s confirmed the request is complete. Your payment has been released.',
        v_requester_first
      ),
      format('/engagement/%s', p_request_id)
    );
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."finalize_request_completion"("p_request_id" "uuid", "p_actor_id" "uuid", "p_status_event_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."format_bucketed_distance"("p_distance_m" integer) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when p_distance_m >= 1000 then
      format('about %s km away', trim(to_char(p_distance_m / 1000.0, 'FM9990.0')))
    else
      format('about %s m away', p_distance_m)
  end;
$$;


ALTER FUNCTION "public"."format_bucketed_distance"("p_distance_m" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_engagement"("p_request_id" "uuid") RETURNS TABLE("request_id" "uuid", "title" "text", "description" "text", "scheduled_for" timestamp with time zone, "offered_amount" numeric, "agreed_provider_amount" numeric, "quoted_amount" numeric, "currency" "text", "request_status" "public"."request_status", "payment_status" "public"."payment_status", "accepted_at" timestamp with time zone, "started_at" timestamp with time zone, "completed_at" timestamp with time zone, "completion_confirm_by" timestamp with time zone, "service_problem_kind" "public"."service_problem_kind", "service_problem_respond_by" timestamp with time zone, "service_problem_reported_by_me" boolean, "service_problem_description" "text", "viewer_is_requester" boolean, "location_label" "text", "request_latitude" double precision, "request_longitude" double precision, "counterparty_id" "uuid", "counterparty_display_name" "text", "counterparty_avatar_path" "text", "counterparty_phone" "text", "counterparty_rating_average" numeric, "counterparty_rating_count" integer, "rating_stars" smallint, "handshake_id" "uuid", "handshake_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with me as (select public.assert_authenticated() as user_id)
  select
    r.id,
    r.title,
    r.description,
    r.scheduled_for,
    r.offered_amount,
    r.agreed_provider_amount,
    accepted.quoted_amount,
    r.currency,
    r.status,
    r.payment_status,
    r.accepted_at,
    r.started_at,
    r.completed_at,
    r.completion_confirm_by,
    sp.kind,
    sp.respond_by,
    sp.reported_by = me.user_id,
    sp.description,
    r.requester_id = me.user_id,
    r.location_label,
    extensions.ST_Y(r.location::extensions.geometry),
    extensions.ST_X(r.location::extensions.geometry),
    counterparty.id,
    counterparty.display_name,
    counterparty.avatar_path,
    counterparty.phone,
    counterparty.rating_average,
    counterparty.rating_count,
    rating.stars,
    h.id,
    h.created_at
  from me
  join public.requests r
    on r.id = p_request_id
   and r.status in (
     'accepted',
     'in_progress',
     'completion_pending',
     'completed',
     'disputed',
     'no_show'
   )
   and me.user_id in (r.requester_id, r.selected_user_id)
  join public.profiles counterparty
    on counterparty.id = case
      when r.requester_id = me.user_id then r.selected_user_id
      else r.requester_id
    end
  left join public.request_responses accepted on accepted.id = r.accepted_response_id
  left join public.service_problems sp
    on sp.request_id = r.id
   and sp.status = 'open'
  left join public.ratings rating on rating.request_id = r.id
  left join public.handshakes h on h.request_id = r.id;
$$;


ALTER FUNCTION "public"."get_engagement"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_catalogue_storage_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if (storage.foldername(new.storage_path))[1] is distinct from new.user_id::text then
    raise exception 'catalogue media must be stored in your own folder' using errcode = '42501';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."guard_catalogue_storage_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_handshake_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  raise exception 'handshakes cannot be modified' using errcode = '55000';
end;
$$;


ALTER FUNCTION "public"."guard_handshake_immutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_profile_catalogue_limits"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_photo_count integer;
  v_video_count integer;
begin
  select count(*)::integer into v_photo_count
  from public.profile_catalogue_media
  where user_id = new.user_id and kind = 'photo';

  select count(*)::integer into v_video_count
  from public.profile_catalogue_media
  where user_id = new.user_id and kind = 'video';

  if tg_op = 'INSERT' then
    if new.kind = 'photo' and v_photo_count >= 6 then
      raise exception 'catalogue cannot have more than 6 photos' using errcode = '22023';
    end if;
    if new.kind = 'video' and v_video_count >= 1 then
      raise exception 'catalogue cannot have more than 1 video' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."guard_profile_catalogue_limits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_profile_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.phone is distinct from old.phone
      or new.avatar_path is distinct from old.avatar_path
      or new.avatar_captured_in_app is distinct from old.avatar_captured_in_app
      or new.rating_average is distinct from old.rating_average
      or new.rating_count is distinct from old.rating_count
      or new.jobs_completed is distinct from old.jobs_completed
      or new.requests_completed is distinct from old.requests_completed then
      raise exception 'profile field is server managed and cannot be set by a client'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."guard_profile_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_request_history_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if old.status in ('completed', 'cancelled', 'expired', 'no_show') then
    if to_jsonb(old) - 'payment_status' = to_jsonb(new) - 'payment_status' then
      return new;
    end if;

    raise exception 'request % is a historical record and cannot be changed', old.id
      using errcode = '55000';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."guard_request_history_immutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone)
  on conflict (id) do nothing;

  insert into public.user_attendance (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.wallet_accounts (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_request_responses"("p_request_id" "uuid") RETURNS TABLE("response_id" "uuid", "responder_id" "uuid", "display_name" "text", "avatar_path" "text", "bio" "text", "rating_average" numeric, "rating_count" integer, "jobs_completed" integer, "phone_verified" boolean, "message" "text", "quoted_amount" numeric, "distance_m" integer, "status" "public"."response_status", "created_at" timestamp with time zone, "expires_at" timestamp with time zone, "responder_available" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    rr.id,
    rr.responder_id,
    p.display_name,
    p.avatar_path,
    p.bio,
    p.rating_average,
    p.rating_count,
    p.jobs_completed,
    p.phone is not null as phone_verified,
    rr.message,
    rr.quoted_amount,
    rr.distance_m,
    rr.status,
    rr.created_at,
    rr.expires_at,
    (ua.request_id is null) as responder_available
  from public.requests r
  join public.request_responses rr on rr.request_id = r.id
  join public.profiles p on p.id = rr.responder_id
  left join public.user_attendance ua on ua.user_id = rr.responder_id
  where r.id = p_request_id
    and r.requester_id = public.assert_authenticated()
    and rr.status in ('pending', 'accepted')
  order by rr.created_at asc;
$$;


ALTER FUNCTION "public"."list_request_responses"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lock_request_escrow"("p_request_id" "uuid", "p_idempotency_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."lock_request_escrow"("p_request_id" "uuid", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_notification_inbox_read"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
begin
  update public.notification_inbox
  set read_at = now()
  where user_id = v_user_id
    and read_at is null;
end;
$$;


ALTER FUNCTION "public"."mark_notification_inbox_read"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_service_complete"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_status public.request_status;
begin
  select status into v_status
  from public.requests
  where id = p_request_id and selected_user_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status in ('completion_pending', 'completed') then
    return;
  end if;

  if v_status not in ('accepted', 'in_progress') then
    raise exception 'only an active job can be marked complete' using errcode = '55000';
  end if;

  update public.requests
  set status = 'completion_pending'::public.request_status,
      completion_confirm_by = now() + public.completion_confirmation_interval()
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'completion_pending'::public.request_status,
    'mark_complete:' || p_request_id::text
  );
end;
$$;


ALTER FUNCTION "public"."mark_service_complete"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_responses"() RETURNS TABLE("response_id" "uuid", "request_id" "uuid", "title" "text", "description" "text", "location_label" "text", "distance_m" integer, "scheduled_for" timestamp with time zone, "offered_amount" numeric, "currency" "text", "quoted_amount" numeric, "message" "text", "response_status" "public"."response_status", "request_status" "public"."request_status", "decline_reason" "text", "requester_display_name" "text", "requester_avatar_path" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with me as (select public.assert_onboarded() as user_id)
  select
    rr.id,
    r.id,
    r.title,
    r.description,
    r.location_label,
    rr.distance_m,
    r.scheduled_for,
    r.offered_amount,
    r.currency,
    rr.quoted_amount,
    rr.message,
    rr.status,
    case
      when r.status = 'posted' and r.expires_at <= now() then 'expired'::public.request_status
      else r.status
    end,
    rr.decline_reason,
    p.display_name,
    p.avatar_path,
    rr.created_at
  from me
  join public.request_responses rr on rr.responder_id = me.user_id
  join public.requests r on r.id = rr.request_id
  join public.profiles p on p.id = r.requester_id
  order by rr.created_at desc;
$$;


ALTER FUNCTION "public"."my_responses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_completion_reminders"("p_limit" integer DEFAULT 100) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_row record;
  v_notified integer := 0;
begin
  if p_limit < 1 then
    raise exception 'limit must be at least 1' using errcode = '22023';
  end if;

  for v_row in
    select r.id, r.requester_id
    from public.requests r
    where r.status = 'completion_pending'::public.request_status
      and r.completion_confirm_by > now()
      and r.completion_confirm_by <= now() + interval '24 hours'
      and r.completion_reminder_sent_at is null
    order by r.completion_confirm_by
    limit p_limit
    for update skip locked
  loop
    perform public.send_push(
      array[v_row.requester_id],
      'Please confirm',
      'Your helper says the request is complete. Confirm or report a problem soon.',
      format('/engagement/%s', v_row.id)
    );

    update public.requests
    set completion_reminder_sent_at = now()
    where id = v_row.id;

    v_notified := v_notified + 1;
  end loop;

  return v_notified;
end;
$$;


ALTER FUNCTION "public"."notify_completion_reminders"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_expiring_requests"("p_limit" integer DEFAULT 100) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_row record;
  v_notified integer := 0;
begin
  if p_limit < 1 then
    raise exception 'limit must be at least 1' using errcode = '22023';
  end if;

  for v_row in
    select r.id, r.requester_id
    from public.requests r
    where r.status = 'posted'::public.request_status
      and r.expires_at > now()
      and r.expires_at <= now() + interval '2 hours'
      and r.expiry_reminder_sent_at is null
      and not exists (select 1 from public.handshakes h where h.request_id = r.id)
    order by r.expires_at
    limit p_limit
    for update skip locked
  loop
    perform public.send_push(
      array[v_row.requester_id],
      'Expiring soon',
      'Your request expires in about two hours if you have not chosen someone yet.',
      format('/request/%s', v_row.id)
    );

    update public.requests
    set expiry_reminder_sent_at = now()
    where id = v_row.id;

    v_notified := v_notified + 1;
  end loop;

  return v_notified;
end;
$$;


ALTER FUNCTION "public"."notify_expiring_requests"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_matching_providers"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_matching_providers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_payment_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_requester_id uuid;
  v_total numeric;
  v_currency text;
begin
  select r.requester_id, r.currency
    into v_requester_id, v_currency
  from public.requests r
  where r.id = new.request_id;

  select re.total into v_total
  from public.request_escrow re
  where re.request_id = new.request_id;

  if new.to_status = 'locked'::public.payment_status
     and new.idempotency_key like 'create:%' then
    perform public.send_push(
      array[v_requester_id],
      'Offer set aside',
      coalesce(
        format('We set aside %s %s for this request.', v_total, v_currency),
        'Your offer is set aside for this request.'
      ),
      format('/request/%s', new.request_id)
    );
  elsif new.to_status = 'refunded'::public.payment_status then
    perform public.send_push(
      array[v_requester_id],
      'Payment returned',
      coalesce(
        format('%s %s was returned to your wallet.', v_total, v_currency),
        'Your payment has been returned to your wallet.'
      ),
      '/wallet'
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_payment_transition"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_provider_of_acceptance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_requester_name text;
  v_requester_first text;
begin
  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = new.requester_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'them');

  perform public.send_push(
    array[new.selected_user_id],
    format('You''re helping %s now', v_requester_first),
    'Open the request for contact details and where to meet.',
    format('/engagement/%s', new.request_id)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_provider_of_acceptance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_requester_of_completion_pending"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_helper_name text;
  v_helper_first text;
begin
  if new.status <> 'completion_pending'::public.request_status
     or old.status = new.status then
    return new;
  end if;

  select p.display_name into v_helper_name
  from public.profiles p
  where p.id = new.selected_user_id;

  v_helper_first := coalesce(public.display_first_name(v_helper_name), 'Your helper');

  perform public.send_push(
    array[new.requester_id],
    'Confirm completion',
    format('%s says the request is complete.', v_helper_first),
    format('/engagement/%s', new.id)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_requester_of_completion_pending"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_requester_of_provider_selected"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_selected_name text;
  v_selected_first text;
begin
  if new.status <> 'accepted'::public.request_status
     or old.status = new.status then
    return new;
  end if;

  select p.display_name into v_selected_name
  from public.profiles p
  where p.id = new.selected_user_id;

  v_selected_first := coalesce(public.display_first_name(v_selected_name), 'Your helper');

  perform public.send_push(
    array[new.requester_id],
    format('%s is helping you', v_selected_first),
    'Open the request for their contact details and your meeting location.',
    format('/engagement/%s', new.id)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_requester_of_provider_selected"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_requester_of_response"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_requester_id uuid;
  v_responder_name text;
  v_responder_first text;
  v_pending_count integer;
  v_title text;
  v_body text;
begin
  if new.status <> 'pending'::public.response_status then
    return new;
  end if;

  select r.requester_id into v_requester_id
  from public.requests r
  where r.id = new.request_id;

  select p.display_name into v_responder_name
  from public.profiles p
  where p.id = new.responder_id;

  v_responder_first := coalesce(public.display_first_name(v_responder_name), 'Someone');

  select count(*)::integer into v_pending_count
  from public.request_responses rr
  where rr.request_id = new.request_id
    and rr.status = 'pending';

  if v_pending_count <= 1 then
    v_title := 'New response';
    v_body := format('%s wants to help with your request.', v_responder_first);
  elsif v_pending_count = 2 then
    v_title := 'Another response';
    v_body := 'You now have two responses to review.';
  else
    v_title := 'New response';
    v_body := format(
      '%s responded. You now have %s responses to review.',
      v_responder_first,
      v_pending_count
    );
  end if;

  perform public.send_push(
    array[v_requester_id],
    v_title,
    v_body,
    format('/request/%s', new.request_id)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_requester_of_response"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_requester_request_published"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.status <> 'posted'::public.request_status then
    return new;
  end if;

  perform public.send_push(
    array[new.requester_id],
    'Request posted',
    format(
      'Your request "%s" is live. We''ll let you know when someone responds.',
      left(new.title, 80)
    ),
    format('/request/%s', new.id)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_requester_request_published"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_responder_of_response_submitted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_requester_name text;
  v_requester_first text;
  v_title text;
begin
  if new.status <> 'pending'::public.response_status then
    return new;
  end if;

  select p.display_name into v_requester_name
  from public.profiles p
  join public.requests r on r.requester_id = p.id
  where r.id = new.request_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'them');
  v_title := left(
    (select r.title from public.requests r where r.id = new.request_id),
    80
  );

  perform public.send_push(
    array[new.responder_id],
    'Response sent',
    format('Your response to "%s" was sent. %s will see it with your profile.', v_title, v_requester_first),
    format('/respond/%s', new.request_id)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_responder_of_response_submitted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_responders_not_chosen"("p_request_id" "uuid", "p_chosen_response_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_requester_name text;
  v_requester_first text;
  v_responder_id uuid;
begin
  select p.display_name into v_requester_name
  from public.profiles p
  join public.requests r on r.requester_id = p.id
  where r.id = p_request_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'The requester');

  for v_responder_id in
    select rr.responder_id
    from public.request_responses rr
    where rr.request_id = p_request_id
      and rr.id <> p_chosen_response_id
      and rr.status = 'declined'::public.response_status
  loop
    perform public.send_push(
      array[v_responder_id],
      'Someone else was chosen',
      format('%s chose someone else for this request.', v_requester_first),
      '/(tabs)/requests'
    );
  end loop;
end;
$$;


ALTER FUNCTION "public"."notify_responders_not_chosen"("p_request_id" "uuid", "p_chosen_response_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_request_statuses"() RETURNS "public"."request_status"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select array['posted']::public.request_status[];
$$;


ALTER FUNCTION "public"."open_request_statuses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_wallet_ledger"("p_idempotency_key" "text", "p_user_id" "uuid", "p_request_id" "uuid", "p_kind" "text", "p_available_delta" numeric, "p_locked_delta" numeric, "p_pending_delta" numeric, "p_platform_available_delta" numeric DEFAULT 0, "p_external_reference" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."post_wallet_ledger"("p_idempotency_key" "text", "p_user_id" "uuid", "p_request_id" "uuid", "p_kind" "text", "p_available_delta" numeric, "p_locked_delta" numeric, "p_pending_delta" numeric, "p_platform_available_delta" numeric, "p_external_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_location_recently_updated"("p_provider_id" "uuid", "p_request_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.provider_availability pa
    where pa.user_id = p_provider_id
      and pa.committed_request_id = p_request_id
      and pa.location is not null
      and pa.updated_at > now() - interval '15 minutes'
  );
$$;


ALTER FUNCTION "public"."provider_location_recently_updated"("p_provider_id" "uuid", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provider_location_updated_since_report"("p_provider_id" "uuid", "p_request_id" "uuid", "p_reported_at" timestamp with time zone) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.provider_availability pa
    where pa.user_id = p_provider_id
      and pa.committed_request_id = p_request_id
      and pa.location is not null
      and pa.updated_at > p_reported_at
      and pa.updated_at > now() - interval '15 minutes'
  );
$$;


ALTER FUNCTION "public"."provider_location_updated_since_report"("p_provider_id" "uuid", "p_request_id" "uuid", "p_reported_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rate_request"("p_request_id" "uuid", "p_stars" smallint, "p_comment" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_provider_id uuid;
begin
  select selected_user_id into v_provider_id
  from public.requests
  where id = p_request_id
    and requester_id = v_user_id
    and status = 'completed';

  if v_provider_id is null then
    raise exception 'only a completed request can be rated' using errcode = '55000';
  end if;

  insert into public.ratings (request_id, rater_id, ratee_id, stars, comment)
  values (p_request_id, v_user_id, v_provider_id, p_stars, nullif(btrim(p_comment), ''));
end;
$$;


ALTER FUNCTION "public"."rate_request"("p_request_id" "uuid", "p_stars" smallint, "p_comment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_request_status_event"("p_request_id" "uuid", "p_actor_id" "uuid", "p_from_status" "public"."request_status", "p_to_status" "public"."request_status", "p_idempotency_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  insert into public.request_status_events (
    request_id,
    actor_id,
    from_status,
    to_status,
    idempotency_key
  )
  values (
    p_request_id,
    p_actor_id,
    p_from_status,
    p_to_status,
    p_idempotency_key
  )
  on conflict (request_id, idempotency_key) do nothing;
end;
$$;


ALTER FUNCTION "public"."record_request_status_event"("p_request_id" "uuid", "p_actor_id" "uuid", "p_from_status" "public"."request_status", "p_to_status" "public"."request_status", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_provider"("p_provider_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.clear_user_attendance(p_provider_id);
$$;


ALTER FUNCTION "public"."release_provider"("p_provider_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_service_problem"("p_request_id" "uuid", "p_kind" "public"."service_problem_kind" DEFAULT 'completion_issue'::"public"."service_problem_kind", "p_description" "text" DEFAULT ''::"text", "p_evidence_paths" "text"[] DEFAULT '{}'::"text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_requester_id uuid;
  v_selected_user_id uuid;
  v_status public.request_status;
  v_payment public.payment_status;
  v_helper_name text;
  v_requester_name text;
  v_description text := coalesce(p_description, '');
  v_evidence text[] := coalesce(p_evidence_paths, '{}');
begin
  perform public.assert_dispute_evidence_paths(v_user_id, v_evidence);

  if public.service_problem_requires_description(p_kind)
     and char_length(btrim(v_description)) < 10 then
    raise exception 'please describe what went wrong (at least 10 characters)' using errcode = '22023';
  end if;

  select r.requester_id, r.selected_user_id, r.status, r.payment_status
    into v_requester_id, v_selected_user_id, v_status, v_payment
  from public.requests r
  where r.id = p_request_id
  for update;

  if v_requester_id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_user_id not in (v_requester_id, v_selected_user_id) then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'disputed' then
    return;
  end if;

  if p_kind = 'completion_issue' then
    if v_user_id <> v_requester_id then
      raise exception 'request not found' using errcode = 'P0002';
    end if;

    if v_status <> 'completion_pending' then
      raise exception 'a completion problem can only be reported while completion is pending'
        using errcode = '55000';
    end if;
  elsif p_kind in ('provider_no_show', 'provider_unreachable') then
    if v_user_id <> v_requester_id then
      raise exception 'request not found' using errcode = 'P0002';
    end if;

    if v_status not in ('accepted', 'in_progress') then
      raise exception 'this problem can only be reported during an active service'
        using errcode = '55000';
    end if;

    if p_kind = 'provider_unreachable'
       and public.provider_location_recently_updated(v_selected_user_id, p_request_id) then
      raise exception
        'your provider''s location was updated recently; try calling or messaging before reporting them unreachable'
        using errcode = '55000';
    end if;
  elsif p_kind = 'client_no_show' then
    if v_user_id <> v_selected_user_id then
      raise exception 'request not found' using errcode = 'P0002';
    end if;

    if v_status not in ('accepted', 'in_progress') then
      raise exception 'this problem can only be reported during an active service'
        using errcode = '55000';
    end if;
  elsif p_kind = 'service_not_completed' then
    if v_status not in ('accepted', 'in_progress', 'completion_pending') then
      raise exception 'this problem can only be reported during an active service'
        using errcode = '55000';
    end if;
  elsif p_kind = 'service_differs_from_request' then
    if v_status not in ('in_progress', 'completion_pending') then
      raise exception 'this problem can only be reported once work has started'
        using errcode = '55000';
    end if;
  elsif p_kind = 'other' then
    if v_status not in ('accepted', 'in_progress', 'completion_pending') then
      raise exception 'this problem can only be reported during an active service'
        using errcode = '55000';
    end if;
  else
    raise exception 'unsupported problem kind' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.service_problems sp
    where sp.request_id = p_request_id
      and sp.status = 'open'
  ) then
    raise exception 'a problem is already open on this request' using errcode = '55000';
  end if;

  insert into public.service_problems (
    request_id,
    kind,
    reported_by,
    status,
    status_before,
    payment_before,
    respond_by,
    description,
    evidence_paths
  )
  values (
    p_request_id,
    p_kind,
    v_user_id,
    'open',
    v_status,
    v_payment,
    case
      when p_kind in ('provider_no_show', 'client_no_show', 'provider_unreachable')
        then now() + public.service_problem_response_interval()
      else null
    end,
    btrim(v_description),
    v_evidence
  );

  update public.requests
  set status = 'disputed',
      completion_confirm_by = null
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'disputed',
    'report_problem:' || p_kind::text || ':' || p_request_id::text
  );

  if v_payment in ('locked', 'pending') then
    perform public.apply_payment_transition(
      p_request_id,
      'disputed',
      'dispute:' || p_kind::text || ':' || p_request_id::text
    );
  end if;

  if p_kind in ('completion_issue', 'service_not_completed', 'service_differs_from_request', 'other')
     and v_selected_user_id is not null then
    perform public.release_provider(v_selected_user_id);
  end if;

  select p.display_name into v_helper_name
  from public.profiles p
  where p.id = v_selected_user_id;

  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = v_requester_id;

  if p_kind = 'provider_no_show' then
    perform public.send_push(
      array[v_selected_user_id],
      'Could not meet up',
      format('%s reported they could not meet up for this request. Open the request to respond.', coalesce(public.display_first_name(v_requester_name), 'The requester')),
      format('/engagement/%s', p_request_id)
    );
  elsif p_kind = 'provider_unreachable' then
    perform public.send_push(
      array[v_selected_user_id],
      'Trying to reach you',
      format('%s is trying to reach you about this request.', coalesce(public.display_first_name(v_requester_name), 'The requester')),
      format('/engagement/%s', p_request_id)
    );
  elsif p_kind = 'client_no_show' then
    perform public.send_push(
      array[v_requester_id],
      'Could not meet up',
      format('%s reported they could not meet up for this request.', coalesce(public.display_first_name(v_helper_name), 'Your helper')),
      format('/engagement/%s', p_request_id)
    );
  elsif p_kind in (
    'completion_issue',
    'service_not_completed',
    'service_differs_from_request',
    'other'
  ) then
    perform public.send_push(
      array[case when v_user_id = v_requester_id then v_selected_user_id else v_requester_id end],
      'Problem reported',
      'There is an open problem on this request. Payment stays on hold until it is resolved.',
      format('/engagement/%s', p_request_id)
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."report_service_problem"("p_request_id" "uuid", "p_kind" "public"."service_problem_kind", "p_description" "text", "p_evidence_paths" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_expires_at"("p_scheduled_for" timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select coalesce(p_scheduled_for, now()) + public.request_lifetime_interval();
$$;


ALTER FUNCTION "public"."request_expires_at"("p_scheduled_for" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_lifetime_interval"() RETURNS interval
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select interval '24 hours';
$$;


ALTER FUNCTION "public"."request_lifetime_interval"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."request_lifetime_interval"() IS 'How long a posted request stays open for selection (from scheduled time or post time).';



CREATE OR REPLACE FUNCTION "public"."request_media_visible_to_party"("p_user_id" "uuid", "p_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.service_problems sp
    join public.requests r on r.id = sp.request_id
    where p_name = any (sp.evidence_paths)
      and (
        r.requester_id = p_user_id
        or r.selected_user_id = p_user_id
      )
  );
$$;


ALTER FUNCTION "public"."request_media_visible_to_party"("p_user_id" "uuid", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_open_to_user"("p_request_id" "uuid", "p_user_id" "uuid", "p_latitude" double precision DEFAULT NULL::double precision, "p_longitude" double precision DEFAULT NULL::double precision) RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_distance_m double precision;
  v_viewer extensions.geography;
begin
  if exists (
    select 1 from public.requests r
    where r.id = p_request_id and r.requester_id = p_user_id
  ) then
    return null;
  end if;

  if p_latitude is not null and p_longitude is not null then
    v_viewer := public.assert_coordinates(p_latitude, p_longitude);
  end if;

  select public.bucket_distance_m(extensions.ST_Distance(r.location, v_viewer))
  into v_distance_m
  from public.requests r
  where r.id = p_request_id
    and r.status = 'posted'
    and r.expires_at > now()
    and (
      v_viewer is null
      or extensions.ST_DWithin(r.location, v_viewer, public.discovery_radius_m())
    );

  return v_distance_m;
end;
$$;


ALTER FUNCTION "public"."request_open_to_user"("p_request_id" "uuid", "p_user_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_due_service_problems"("p_limit" integer DEFAULT 100) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_problem_id uuid;
  v_resolved_count integer := 0;
begin
  if p_limit < 1 then
    raise exception 'limit must be at least 1' using errcode = '22023';
  end if;

  for v_problem_id in
    select sp.id
    from public.service_problems sp
    where sp.status = 'open'
      and sp.respond_by is not null
      and sp.respond_by <= now()
      and sp.kind in ('provider_no_show', 'client_no_show', 'provider_unreachable')
    order by sp.respond_by
    limit p_limit
    for update skip locked
  loop
    if public.resolve_service_problem(v_problem_id) then
      v_resolved_count := v_resolved_count + 1;
    end if;
  end loop;

  return v_resolved_count;
end;
$$;


ALTER FUNCTION "public"."resolve_due_service_problems"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_service_problem"("p_problem_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_problem public.service_problems%rowtype;
  v_provider_id uuid;
  v_resolved boolean := false;
begin
  select sp.*
    into v_problem
  from public.service_problems sp
  where sp.id = p_problem_id
  for update;

  if v_problem.id is null or v_problem.status <> 'open' then
    return false;
  end if;

  if v_problem.respond_by is null or v_problem.respond_by > now() then
    return false;
  end if;

  select r.selected_user_id into v_provider_id
  from public.requests r
  where r.id = v_problem.request_id
  for update;

  if v_problem.kind in ('provider_no_show', 'provider_unreachable') then
    if public.provider_location_updated_since_report(
      v_provider_id,
      v_problem.request_id,
      v_problem.created_at
    ) then
      return false;
    end if;

    v_resolved := public.finalize_provider_no_show_resolution(
      v_problem.request_id,
      v_problem.reported_by,
      'auto_no_show:' || v_problem.id::text,
      'no_show_refund:' || v_problem.id::text
    );
  elsif v_problem.kind = 'client_no_show' then
    v_resolved := public.finalize_client_no_show_resolution(
      v_problem.request_id,
      v_problem.reported_by,
      'auto_no_show:' || v_problem.id::text,
      'no_show_release:' || v_problem.id::text
    );
  else
    return false;
  end if;

  if v_resolved then
    update public.service_problems
    set status = 'resolved',
        resolution = case
                       when v_problem.kind = 'client_no_show' then 'auto_provider_paid'
                       else 'auto_client_refund'
                     end,
        resolved_at = now()
    where id = v_problem.id;
  end if;

  return v_resolved;
end;
$$;


ALTER FUNCTION "public"."resolve_service_problem"("p_problem_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_to_request"("p_request_id" "uuid", "p_message" "text" DEFAULT NULL::"text", "p_quoted_amount" numeric DEFAULT NULL::numeric, "p_latitude" double precision DEFAULT NULL::double precision, "p_longitude" double precision DEFAULT NULL::double precision) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_onboarded();
  v_distance_m integer;
  v_response_id uuid;
  v_request_expires_at timestamptz;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.avatar_path is not null
      and p.avatar_captured_in_app
  ) then
    raise exception 'add a profile photo in the app before responding' using errcode = '55000';
  end if;

  v_distance_m := public.request_open_to_user(
    p_request_id,
    v_user_id,
    p_latitude,
    p_longitude
  );

  if v_distance_m is null then
    raise exception 'this request is no longer available to you' using errcode = '55000';
  end if;

  select r.expires_at into v_request_expires_at
  from public.requests r
  where r.id = p_request_id;

  insert into public.request_responses (
    request_id,
    responder_id,
    message,
    quoted_amount,
    distance_m,
    expires_at
  )
  values (
    p_request_id,
    v_user_id,
    nullif(btrim(p_message), ''),
    p_quoted_amount,
    v_distance_m,
    v_request_expires_at
  )
  on conflict (request_id, responder_id) do update
  set message = excluded.message,
      quoted_amount = excluded.quoted_amount,
      distance_m = excluded.distance_m,
      expires_at = excluded.expires_at
  where public.request_responses.status = 'pending'
  returning id into v_response_id;

  if v_response_id is null then
    raise exception 'you already have a response on this request' using errcode = '55000';
  end if;

  return v_response_id;
end;
$$;


ALTER FUNCTION "public"."respond_to_request"("p_request_id" "uuid", "p_message" "text", "p_quoted_amount" numeric, "p_latitude" double precision, "p_longitude" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_push"("p_user_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_messages jsonb;
begin
  if coalesce(array_length(p_user_ids, 1), 0) = 0 then
    return;
  end if;

  insert into public.notification_inbox (user_id, title, body, url)
  select distinct uid, p_title, p_body, p_url
  from unnest(p_user_ids) as uid;

  -- Expo accepts up to 100 messages per call. Beyond that this needs chunking, which
  -- the MVP's volumes do not reach.
  select jsonb_agg(
           jsonb_build_object(
             'to', t.token,
             'title', p_title,
             'body', p_body,
             'sound', 'default',
             'data', jsonb_build_object('url', p_url)
           )
         )
    into v_messages
  from public.push_tokens t
  where t.user_id = any (p_user_ids);

  if v_messages is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_messages
  );
end;
$$;


ALTER FUNCTION "public"."send_push"("p_user_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."service_problem_requires_description"("p_kind" "public"."service_problem_kind") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select p_kind in (
    'completion_issue',
    'service_not_completed',
    'service_differs_from_request',
    'other'
  );
$$;


ALTER FUNCTION "public"."service_problem_requires_description"("p_kind" "public"."service_problem_kind") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."service_problem_response_interval"() RETURNS interval
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select interval '24 hours';
$$;


ALTER FUNCTION "public"."service_problem_response_interval"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_attendance"("p_user_id" "uuid", "p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.user_attendance
  set request_id = p_request_id
  where user_id = p_user_id
    and request_id is null;

  if not found then
    raise exception 'This person is currently attending to another request.' using errcode = '55000';
  end if;
end;
$$;


ALTER FUNCTION "public"."set_user_attendance"("p_user_id" "uuid", "p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_request"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_status public.request_status;
  v_requester_id uuid;
  v_helper_name text;
  v_helper_first text;
begin
  select status, requester_id
    into v_status, v_requester_id
  from public.requests
  where id = p_request_id and selected_user_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status = 'in_progress' then
    return;
  end if;

  if v_status <> 'accepted' then
    raise exception 'only a selected request can be started' using errcode = '55000';
  end if;

  update public.requests
  set status = 'in_progress',
      started_at = now()
  where id = p_request_id;

  perform public.record_request_status_event(
    p_request_id,
    v_user_id,
    v_status,
    'in_progress'::public.request_status,
    'start:' || p_request_id::text
  );

  select p.display_name into v_helper_name
  from public.profiles p
  where p.id = v_user_id;

  v_helper_first := coalesce(public.display_first_name(v_helper_name), 'Your helper');

  perform public.send_push(
    array[v_requester_id],
    'In progress',
    format('%s has started helping you.', v_helper_first),
    format('/engagement/%s', p_request_id)
  );
end;
$$;


ALTER FUNCTION "public"."start_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_wallet_payment_transition"("p_request_id" "uuid", "p_from" "public"."payment_status", "p_to" "public"."payment_status", "p_idempotency_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_escrow public.request_escrow%rowtype;
  v_selected_user_id uuid;
begin
  if not exists (select 1 from public.request_escrow re where re.request_id = p_request_id) then
    return;
  end if;

  select * into v_escrow
  from public.request_escrow re
  where re.request_id = p_request_id;

  select r.selected_user_id into v_selected_user_id
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
    if v_selected_user_id is null then
      raise exception 'cannot release escrow without a selected user' using errcode = '55000';
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
      v_selected_user_id,
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
    if v_selected_user_id is null then
      raise exception 'cannot release escrow without a selected user' using errcode = '55000';
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
      v_selected_user_id,
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


ALTER FUNCTION "public"."sync_wallet_payment_transition"("p_request_id" "uuid", "p_from" "public"."payment_status", "p_to" "public"."payment_status", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wallet_record_deposit"("p_user_id" "uuid", "p_amount" numeric, "p_idempotency_key" "text", "p_external_reference" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if session_user not in ('postgres', 'supabase_admin', 'service_role')
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
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


ALTER FUNCTION "public"."wallet_record_deposit"("p_user_id" "uuid", "p_amount" numeric, "p_idempotency_key" "text", "p_external_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wallet_top_up"("p_amount" numeric, "p_idempotency_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  if p_amount > 1000000 then
    raise exception 'amount exceeds the per-operation limit' using errcode = '22023';
  end if;

  perform public.post_wallet_ledger(
    'manual_top_up:' || p_idempotency_key,
    v_user_id,
    null,
    'manual_top_up',
    p_amount,
    0,
    0
  );
end;
$$;


ALTER FUNCTION "public"."wallet_top_up"("p_amount" numeric, "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wallet_withdraw"("p_amount" numeric, "p_idempotency_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_available numeric;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  if p_amount > 1000000 then
    raise exception 'amount exceeds the per-operation limit' using errcode = '22023';
  end if;

  perform public.ensure_wallet_account(v_user_id);

  select wa.available into v_available
  from public.wallet_accounts wa
  where wa.user_id = v_user_id;

  if v_available < p_amount then
    raise exception 'insufficient available balance to withdraw' using errcode = '55000';
  end if;

  perform public.post_wallet_ledger(
    'manual_withdraw:' || p_idempotency_key,
    v_user_id,
    null,
    'manual_withdraw',
    -p_amount,
    0,
    0
  );
end;
$$;


ALTER FUNCTION "public"."wallet_withdraw"("p_amount" numeric, "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."withdraw_response"("p_response_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_status public.response_status;
  v_updated uuid;
begin
  select status into v_status
  from public.request_responses
  where id = p_response_id
    and responder_id = v_user_id
  for update;

  if v_status is null then
    raise exception 'this response can no longer be withdrawn' using errcode = '55000';
  end if;

  if v_status = 'withdrawn' then
    return;
  end if;

  update public.request_responses
  set status = 'withdrawn',
      resolved_at = now()
  where id = p_response_id
    and responder_id = v_user_id
    and status = 'pending'
  returning id into v_updated;

  if v_updated is null then
    raise exception 'this response can no longer be withdrawn' using errcode = '55000';
  end if;
end;
$$;


ALTER FUNCTION "public"."withdraw_response"("p_response_id" "uuid") OWNER TO "postgres";

