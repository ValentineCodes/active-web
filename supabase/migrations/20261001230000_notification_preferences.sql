-- Push delivery respects user preferences; notification_inbox is unaffected.

ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "push_notifications_enabled" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "message_push_enabled" boolean DEFAULT true NOT NULL;

COMMENT ON COLUMN "public"."profiles"."push_notifications_enabled" IS
  'When false, Expo push is not sent; persistent notification_inbox rows are still created.';

COMMENT ON COLUMN "public"."profiles"."message_push_enabled" IS
  'When false, push for new_message and missed_call is suppressed (inbox unchanged).';

CREATE OR REPLACE FUNCTION "public"."user_push_delivery_allowed"(
  "p_user_id" "uuid",
  "p_type" "public"."notification_type"
) RETURNS boolean
  LANGUAGE "sql" STABLE
  SET "search_path" TO ''
  AS $$
  select coalesce(
    (
      select
        p.push_notifications_enabled
        and (
          p_type not in (
            'new_message'::public.notification_type,
            'missed_call'::public.notification_type
          )
          or p.message_push_enabled
        )
      from public.profiles p
      where p.id = p_user_id
    ),
    false
  );
$$;

ALTER FUNCTION "public"."user_push_delivery_allowed"("p_user_id" "uuid", "p_type" "public"."notification_type") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_notification_preferences"(
  "p_push_notifications_enabled" boolean,
  "p_message_push_enabled" boolean
) RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_user_id uuid := public.assert_authenticated();
begin
  update public.profiles
  set push_notifications_enabled = p_push_notifications_enabled,
      message_push_enabled = p_message_push_enabled
  where id = v_user_id;

  if not p_push_notifications_enabled then
    delete from public.push_tokens pt
    where pt.user_id = v_user_id;
  end if;
end;
$$;

ALTER FUNCTION "public"."set_notification_preferences"(boolean, boolean) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_notification_preferences"(boolean, boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_notification_preferences"(boolean, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_notification_preferences"(boolean, boolean) TO "service_role";

CREATE OR REPLACE FUNCTION "public"."deliver_expo_push"(
  "p_recipient_user_id" "uuid",
  "p_title" "text",
  "p_body" "text",
  "p_url" "text",
  "p_type" "public"."notification_type",
  "p_request_id" "uuid",
  "p_response_id" "uuid",
  "p_payment_transition_id" "uuid",
  "p_wallet_ledger_id" "uuid",
  "p_related_user_id" "uuid"
) RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_messages jsonb;
  v_chunk jsonb;
  v_chunk_tokens text[];
  v_offset integer := 0;
  v_chunk_size constant integer := 100;
  v_http extensions.http_response;
  v_response jsonb;
begin
  if not public.notification_type_should_push(p_type) then
    return;
  end if;

  if not public.user_push_delivery_allowed(p_recipient_user_id, p_type) then
    return;
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'to', t.token,
             'title', p_title,
             'body', p_body,
             'sound', 'default',
             'data', jsonb_strip_nulls(
               jsonb_build_object(
                 'url', p_url,
                 'type', p_type,
                 'request_id', p_request_id,
                 'response_id', p_response_id,
                 'payment_transition_id', p_payment_transition_id,
                 'wallet_ledger_id', p_wallet_ledger_id,
                 'related_user_id', p_related_user_id
               )
             )
           )
           order by t.updated_at desc
         )
    into v_messages
  from public.push_tokens t
  where t.user_id = p_recipient_user_id;

  if v_messages is null or jsonb_array_length(v_messages) = 0 then
    return;
  end if;

  while v_offset < jsonb_array_length(v_messages) loop
    select coalesce(
             jsonb_agg(entry.value order by entry.ord),
             '[]'::jsonb
           ),
           coalesce(
             array_agg(entry.value ->> 'to' order by entry.ord),
             '{}'::text[]
           )
      into v_chunk,
           v_chunk_tokens
    from jsonb_array_elements(v_messages) with ordinality as entry(value, ord)
    where entry.ord > v_offset
      and entry.ord <= v_offset + v_chunk_size;

    if jsonb_array_length(v_chunk) = 0 then
      exit;
    end if;

    v_http := extensions.http_post(
      'https://exp.host/--/api/v2/push/send',
      v_chunk::text,
      'application/json'
    );

    if v_http.status >= 200 and v_http.status < 300 then
      begin
        v_response := v_http.content::jsonb;
      exception
        when others then
          v_response := null;
      end;
      perform public.prune_invalid_expo_push_tokens(v_chunk_tokens, v_response);
    end if;

    v_offset := v_offset + v_chunk_size;
  end loop;
end;
$$;
