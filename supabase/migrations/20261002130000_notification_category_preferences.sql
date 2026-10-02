-- Granular push categories for notification settings UI.

DROP FUNCTION IF EXISTS "public"."set_notification_preferences"(boolean, boolean);

ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "push_payments_wallet_enabled" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "push_calls_enabled" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "push_tips_reminders_enabled" boolean DEFAULT true NOT NULL;

COMMENT ON COLUMN "public"."profiles"."push_payments_wallet_enabled" IS
  'Push for payment_secured, payouts, withdrawals, and wallet events.';

COMMENT ON COLUMN "public"."profiles"."push_calls_enabled" IS
  'Push for missed_call alerts.';

COMMENT ON COLUMN "public"."profiles"."push_tips_reminders_enabled" IS
  'Push for rate_experience and request expiry reminders.';

CREATE OR REPLACE FUNCTION "public"."user_push_delivery_allowed"(
  "p_user_id" "uuid",
  "p_type" "public"."notification_type"
) RETURNS boolean
  LANGUAGE "sql" STABLE
  SET "search_path" TO ''
  AS $$
  select coalesce(
    (
      select case
        when p_type in (
          'dispute_opened'::public.notification_type,
          'dispute_resolved'::public.notification_type,
          'problem_reported'::public.notification_type
        ) then true
        when p_type = 'new_message'::public.notification_type then p.message_push_enabled
        when p_type = 'missed_call'::public.notification_type then p.push_calls_enabled
        when p_type in (
          'payment_secured'::public.notification_type,
          'funds_returned'::public.notification_type,
          'payment_released'::public.notification_type,
          'payment_received'::public.notification_type,
          'withdrawal_processing'::public.notification_type,
          'withdrawal_successful'::public.notification_type,
          'withdrawal_failed'::public.notification_type,
          'funds_released_after_resolution'::public.notification_type
        ) then p.push_payments_wallet_enabled
        when p_type in (
          'rate_experience'::public.notification_type,
          'request_expiring'::public.notification_type,
          'request_expired'::public.notification_type
        ) then p.push_tips_reminders_enabled
        else p.push_notifications_enabled
      end
      from public.profiles p
      where p.id = p_user_id
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION "public"."set_notification_preferences"(
  "p_push_notifications_enabled" boolean,
  "p_message_push_enabled" boolean,
  "p_push_payments_wallet_enabled" boolean,
  "p_push_calls_enabled" boolean,
  "p_push_tips_reminders_enabled" boolean
) RETURNS "void"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO ''
  AS $$
declare
  v_user_id uuid := public.assert_authenticated();
begin
  update public.profiles
  set push_notifications_enabled = p_push_notifications_enabled,
      message_push_enabled = p_message_push_enabled,
      push_payments_wallet_enabled = p_push_payments_wallet_enabled,
      push_calls_enabled = p_push_calls_enabled,
      push_tips_reminders_enabled = p_push_tips_reminders_enabled
  where id = v_user_id;

  if not (
    p_push_notifications_enabled
    or p_message_push_enabled
    or p_push_payments_wallet_enabled
    or p_push_calls_enabled
    or p_push_tips_reminders_enabled
  ) then
    delete from public.push_tokens pt
    where pt.user_id = v_user_id;
  end if;
end;
$$;

REVOKE ALL ON FUNCTION "public"."set_notification_preferences"(boolean, boolean, boolean, boolean, boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_notification_preferences"(boolean, boolean, boolean, boolean, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_notification_preferences"(boolean, boolean, boolean, boolean, boolean) TO "service_role";
