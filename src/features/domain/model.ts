import type { Database } from '@/lib/supabase/database.types';

/** One account; requester and provider capabilities are contextual, not roles. */
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProviderAvailability = Database['public']['Tables']['provider_availability']['Row'];
export type RequestRow = Database['public']['Tables']['requests']['Row'];
export type RequestResponse = Database['public']['Tables']['request_responses']['Row'];
export type Handshake = Database['public']['Tables']['handshakes']['Row'];
export type ProfileCatalogueMedia = Database['public']['Tables']['profile_catalogue_media']['Row'];

export type RequestStatus = Database['public']['Enums']['request_status'];
export type ResponseStatus = Database['public']['Enums']['response_status'];
export type PaymentStatus = Database['public']['Enums']['payment_status'];
export type AvailabilityStatus = Database['public']['Enums']['availability_status'];
export type ProfileCatalogueKind = Database['public']['Enums']['profile_catalogue_kind'];

/** Pre-handshake: discovery and private responses. */
export const PRE_HANDSHAKE_REQUEST_STATUSES: RequestStatus[] = ['draft', 'searching'];

/** After handshake (acceptance); service delivery and settlement. */
export const POST_HANDSHAKE_REQUEST_STATUSES: RequestStatus[] = [
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
