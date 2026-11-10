export type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  avatar_captured_in_app: boolean;
  phone: string | null;
  bio: string | null;
  rating_average: number | null;
  rating_count: number | null;
  jobs_completed: number | null;
  requests_completed: number | null;
  push_notifications_enabled: boolean;
  message_push_enabled: boolean;
  push_payments_wallet_enabled: boolean;
  push_calls_enabled: boolean;
  push_tips_reminders_enabled: boolean;
};
