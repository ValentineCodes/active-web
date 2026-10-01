CREATE OR REPLACE FUNCTION "public"."decline_response"("p_response_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_user_id uuid := public.assert_authenticated();
  v_reason text := nullif(btrim(p_reason), '');
  v_row record;
  v_requester_name text;
  v_requester_first text;
  v_body text;
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
  returning rr.id, rr.request_id, rr.responder_id into v_row;

  if v_row.id is null then
    raise exception 'this response is no longer pending' using errcode = '55000';
  end if;

  select p.display_name into v_requester_name
  from public.profiles p
  where p.id = v_user_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'The requester');

  if v_reason is not null then
    v_body := format(
      '%s decided not to select you. They said: %s',
      v_requester_first,
      v_reason
    );
  else
    v_body := format('%s decided not to select you for this request.', v_requester_first);
  end if;

  perform public.create_notification(
    v_row.responder_id,
    'response:' || v_row.id::text || ':declined_by_requester',
    'response_not_selected'::public.notification_type,
    'Not selected',
    v_body,
    format('/respond/%s', v_row.request_id),
    v_row.request_id,
    v_row.id,
    null,
    null,
    v_user_id,
    case when v_reason is null then null else jsonb_build_object('decline_reason', v_reason) end,
    true
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."notify_responders_not_chosen"("p_request_id" "uuid", "p_chosen_response_id" "uuid") RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_requester_name text;
  v_requester_first text;
  v_row record;
begin
  select p.display_name into v_requester_name
  from public.profiles p
  join public.requests r on r.requester_id = p.id
  where r.id = p_request_id;

  v_requester_first := coalesce(public.display_first_name(v_requester_name), 'The requester');

  for v_row in
    select rr.id, rr.responder_id
    from public.request_responses rr
    where rr.request_id = p_request_id
      and rr.id <> p_chosen_response_id
      and rr.status = 'declined'::public.response_status
  loop
    perform public.create_notification(
      v_row.responder_id,
      'response:' || v_row.id::text || ':not_selected',
      'response_not_selected'::public.notification_type,
      'Someone else was chosen',
      format('%s chose someone else for this request.', v_requester_first),
      format('/respond/%s', p_request_id),
      p_request_id,
      v_row.id,
      null,
      null,
      (select r.requester_id from public.requests r where r.id = p_request_id),
      null,
      true
    );
  end loop;
end;
$$;
