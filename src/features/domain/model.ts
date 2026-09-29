import type { Database } from '@/lib/supabase/database.types';

/** One account; requester and helper roles are contextual, never stored. */
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type RequestRow = Database['public']['Tables']['requests']['Row'];
export type RequestResponse = Database['public']['Tables']['request_responses']['Row'];
export type Handshake = Database['public']['Tables']['handshakes']['Row'];
export type UserAttendance = Database['public']['Tables']['user_attendance']['Row'];
export type ProfileCatalogueMedia = Database['public']['Tables']['profile_catalogue_media']['Row'];

export type RequestStatus = Database['public']['Enums']['request_status'];
export type ResponseStatus = Database['public']['Enums']['response_status'];
export type PaymentStatus = Database['public']['Enums']['payment_status'];
export type ProfileCatalogueKind = Database['public']['Enums']['profile_catalogue_kind'];

/** Open for responses (UI may show a separate "Responses" stage while still `posted`). */
export const OPEN_REQUEST_STATUSES: RequestStatus[] = ['draft', 'posted'];

/** After selection through service delivery. */
export const SELECTED_REQUEST_STATUSES: RequestStatus[] = [
  'accepted',
  'in_progress',
  'completion_pending',
  'completed',
  'disputed',
  'no_show',
];

export const TERMINAL_REQUEST_STATUSES: RequestStatus[] = [
  'completed',
  'cancelled',
  'expired',
  'no_show',
];

export const PROFILE_CATALOGUE_PHOTO_LIMIT = 6;
export const PROFILE_CATALOGUE_VIDEO_LIMIT = 1;

export const REQUEST_MAX_LIFETIME_HOURS = 24;

/** Must stay aligned with public.completion_confirmation_interval(). */
export const REQUEST_COMPLETION_CONFIRMATION_HOURS = 72;

/** User-facing lifecycle labels mapped to stored request_status values. */
export const REQUEST_LIFECYCLE_LABELS: Record<
  'posted' | 'responses' | 'selected' | 'in_progress' | 'completion_pending' | 'completed',
  string
> = {
  posted: 'Posted',
  responses: 'Responses',
  selected: 'Selected',
  in_progress: 'In progress',
  completion_pending: 'Completion pending',
  completed: 'Completed',
};

export function isOpenRequestStatus(status: RequestStatus): boolean {
  return status === 'posted' || status === 'draft';
}

export function isAttendingRequestStatus(status: RequestStatus): boolean {
  return ['accepted', 'in_progress', 'completion_pending', 'disputed'].includes(status);
}
