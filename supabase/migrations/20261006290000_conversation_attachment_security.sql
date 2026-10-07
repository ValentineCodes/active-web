-- Harden chat attachment visibility, metadata access, and in-flight send privacy.

CREATE OR REPLACE FUNCTION "public"."request_message_visible_to_viewer"(
  "p_message_id" "uuid",
  "p_viewer_id" "uuid"
) RETURNS boolean
  LANGUAGE "sql"
  STABLE
  SET "search_path" TO ''
  AS $$
  select exists (
    select 1
    from public.request_messages m
    where m.id = p_message_id
      and (
        m.sender_id = p_viewer_id
        or not exists (
          select 1
          from public.request_message_attachments a
          where a.message_id = m.id
            and a.uploaded_at is null
        )
      )
  );
$$;

ALTER FUNCTION "public"."request_message_visible_to_viewer"("p_message_id" "uuid", "p_viewer_id" "uuid") OWNER TO "postgres";

DROP POLICY IF EXISTS "request_message_attachments_select_participant"
  ON "public"."request_message_attachments";

CREATE POLICY "request_message_attachments_select_participant"
  ON "public"."request_message_attachments"
  FOR SELECT TO "authenticated"
  USING (
    public.request_conversation_is_accessible(
      "conversation_id",
      (SELECT "auth"."uid"() AS "uid")
    )
    AND (
      "uploaded_at" IS NOT NULL
      OR "sender_id" = (SELECT "auth"."uid"() AS "uid")
    )
  );

CREATE OR REPLACE FUNCTION "public"."request_message_attachments_for_row"("p_message_id" "uuid")
RETURNS "jsonb"
  LANGUAGE "sql"
  STABLE
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  with me as (
    select public.assert_authenticated() as user_id
  ),
  msg as (
    select m.id, m.conversation_id
    from public.request_messages m
    where m.id = p_message_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'storage_path', a.storage_path,
        'file_name', a.file_name,
        'mime_type', a.mime_type,
        'file_size', a.file_size,
        'attachment_type', a.attachment_type,
        'created_at', a.created_at
      )
      order by a.created_at, a.id
    ),
    '[]'::jsonb
  )
  from me
  join msg on public.request_conversation_is_accessible(msg.conversation_id, me.user_id)
  join public.request_message_attachments a
    on a.message_id = msg.id
   and (
     a.uploaded_at is not null
     or a.sender_id = me.user_id
   );
$$;

ALTER FUNCTION "public"."request_message_attachments_for_row"("p_message_id" "uuid") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."request_message_attachments_for_row"("p_message_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."request_message_attachments_for_row"("p_message_id" "uuid") FROM "authenticated";
GRANT ALL ON FUNCTION "public"."request_message_attachments_for_row"("p_message_id" "uuid") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."list_request_messages"(
  "p_conversation_id" "uuid",
  "p_limit" integer DEFAULT 40,
  "p_before" timestamp with time zone DEFAULT NULL
) RETURNS TABLE(
  "message_id" "uuid",
  "sender_id" "uuid",
  "message_type" "public"."conversation_message_type",
  "body" "text",
  "metadata" "jsonb",
  "attachments" "jsonb",
  "created_at" timestamp with time zone,
  "read_at" timestamp with time zone
)
  LANGUAGE "sql"
  STABLE
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  with me as (select public.assert_authenticated() as user_id)
  select
    m.id,
    m.sender_id,
    m.message_type,
    m.body,
    m.metadata,
    public.request_message_attachments_for_row(m.id),
    m.created_at,
    m.read_at
  from me
  join public.request_conversations c
    on c.id = p_conversation_id
   and public.request_conversation_is_accessible(c.id, me.user_id)
  join public.request_messages m
    on m.conversation_id = c.id
   and (p_before is null or m.created_at < p_before)
   and public.request_message_visible_to_viewer(m.id, me.user_id)
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;

CREATE OR REPLACE FUNCTION "public"."get_request_message_for_viewer"("p_message_id" "uuid")
RETURNS TABLE(
  "message_id" "uuid",
  "sender_id" "uuid",
  "message_type" "public"."conversation_message_type",
  "body" "text",
  "metadata" "jsonb",
  "attachments" "jsonb",
  "created_at" timestamp with time zone,
  "read_at" timestamp with time zone
)
  LANGUAGE "sql"
  STABLE
  SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
  with me as (select public.assert_authenticated() as user_id)
  select
    m.id,
    m.sender_id,
    m.message_type,
    m.body,
    m.metadata,
    public.request_message_attachments_for_row(m.id),
    m.created_at,
    m.read_at
  from me
  join public.request_messages m on m.id = p_message_id
  join public.request_conversations c on c.id = m.conversation_id
  where public.request_conversation_is_accessible(c.id, me.user_id)
    and public.request_message_visible_to_viewer(m.id, me.user_id);
$$;

REVOKE ALL ON FUNCTION "public"."request_message_visible_to_viewer"("p_message_id" "uuid", "p_viewer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_message_visible_to_viewer"("p_message_id" "uuid", "p_viewer_id" "uuid") TO "service_role";
