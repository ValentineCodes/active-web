-- Wire request conversations into accept_response (selection + handshake lifecycle).

CREATE OR REPLACE FUNCTION "public"."ensure_request_conversation"(
  "p_request_id" "uuid",
  "p_requester_id" "uuid",
  "p_selected_user_id" "uuid"
) RETURNS "uuid"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_request public.requests%rowtype;
  v_conversation_id uuid;
begin
  if p_request_id is null
     or p_requester_id is null
     or p_selected_user_id is null then
    raise exception 'conversation participants are required' using errcode = '22023';
  end if;

  if p_requester_id = p_selected_user_id then
    raise exception 'conversation requires two distinct participants' using errcode = '22023';
  end if;

  select *
    into v_request
  from public.requests r
  where r.id = p_request_id;

  if v_request.id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_request.requester_id is distinct from p_requester_id
     or v_request.selected_user_id is distinct from p_selected_user_id then
    raise exception 'conversation does not match request selection' using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.handshakes h
    where h.request_id = p_request_id
      and h.requester_id = p_requester_id
      and h.selected_user_id = p_selected_user_id
  ) then
    raise exception 'conversation requires a completed selection handshake' using errcode = '55000';
  end if;

  insert into public.request_conversations (
    request_id,
    requester_id,
    selected_user_id,
    created_at,
    updated_at
  )
  values (
    p_request_id,
    p_requester_id,
    p_selected_user_id,
    now(),
    now()
  )
  on conflict (request_id) do nothing;

  select c.id
    into v_conversation_id
  from public.request_conversations c
  where c.request_id = p_request_id;

  if v_conversation_id is null then
    raise exception 'conversation could not be created' using errcode = '55000';
  end if;

  return v_conversation_id;
end;
$$;

ALTER FUNCTION "public"."ensure_request_conversation"(
  "p_request_id" "uuid",
  "p_requester_id" "uuid",
  "p_selected_user_id" "uuid"
) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."ensure_request_conversation"(
  "p_request_id" "uuid",
  "p_requester_id" "uuid",
  "p_selected_user_id" "uuid"
) IS
  'Idempotently creates the request conversation after selection; requires matching handshake and request.selected_user_id.';

CREATE OR REPLACE FUNCTION "public"."get_request_conversation"("p_request_id" "uuid")
RETURNS TABLE(
  "conversation_id" "uuid",
  "request_id" "uuid",
  "requester_id" "uuid",
  "selected_user_id" "uuid",
  "created_at" timestamp with time zone,
  "updated_at" timestamp with time zone
)
  LANGUAGE "sql"
  STABLE
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  with me as (select public.assert_authenticated() as user_id)
  select
    c.id,
    c.request_id,
    c.requester_id,
    c.selected_user_id,
    c.created_at,
    c.updated_at
  from me
  join public.request_conversations c
    on c.request_id = p_request_id
   and me.user_id in (c.requester_id, c.selected_user_id)
  join public.handshakes h
    on h.request_id = c.request_id
   and h.requester_id = c.requester_id
   and h.selected_user_id = c.selected_user_id
  join public.requests r
    on r.id = c.request_id
   and r.selected_user_id = c.selected_user_id;
$$;

ALTER FUNCTION "public"."get_request_conversation"("p_request_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_request_conversation"("p_request_id" "uuid") IS
  'Returns the conversation for a request when the caller is a party and selection is complete.';

CREATE OR REPLACE FUNCTION "public"."accept_response"("p_response_id" "uuid") RETURNS "uuid"
  LANGUAGE "plpgsql"
  SECURITY DEFINER
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
  v_requester_name text;
  v_requester_first text;
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

  perform public.ensure_request_conversation(
    v_request_id,
    v_requester_id,
    v_selected_user_id
  );

  select p.display_name
    into v_requester_name
  from public.profiles p
  where p.id = v_requester_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'them');

  perform public.create_notification(
    v_selected_user_id,
    'request:' || v_request_id::text || ':accepted',
    'response_accepted'::public.notification_type,
    format('You''re helping %s now', v_requester_first),
    'Open the request to chat, see contact details, and where to meet.',
    format('/engagement/%s', v_request_id),
    v_request_id,
    p_response_id,
    null,
    null,
    v_requester_id,
    null,
    true
  );

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

DROP TRIGGER IF EXISTS "handshakes_create_request_conversation" ON "public"."handshakes";

DROP FUNCTION IF EXISTS "public"."create_request_conversation_for_handshake"();

REVOKE ALL ON FUNCTION "public"."ensure_request_conversation"(
  "p_request_id" "uuid",
  "p_requester_id" "uuid",
  "p_selected_user_id" "uuid"
) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_request_conversation"(
  "p_request_id" "uuid",
  "p_requester_id" "uuid",
  "p_selected_user_id" "uuid"
) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_request_conversation"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_request_conversation"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_request_conversation"("p_request_id" "uuid") TO "service_role";
