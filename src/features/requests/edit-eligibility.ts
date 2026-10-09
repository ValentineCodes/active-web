import type { Database } from '@/lib/supabase/database.types';
import { isExpiredRequestView } from '@/features/requests/reuse';

type RequestStatus = Database['public']['Enums']['request_status'];

export type RequestEditEligibilityInput = {
  status: RequestStatus;
  expires_at: string | null;
  first_response_at?: string | null;
  /** From `my_requests.is_editable` when available. */
  is_editable?: boolean | null;
};

/**
 * Whether the requester may edit this request. Prefer `is_editable` from the server view;
 * client checks mirror `request_allows_requester_edit` for offline UI only.
 */
export function isRequestEditable(input: RequestEditEligibilityInput): boolean {
  if (input.is_editable != null) {
    return input.is_editable;
  }

  if (input.first_response_at) {
    return false;
  }

  if (isExpiredRequestView(input.status, input.expires_at)) {
    return false;
  }

  if (input.status !== 'posted' && input.status !== 'searching') {
    return false;
  }

  if (!input.expires_at || new Date(input.expires_at).getTime() <= Date.now()) {
    return false;
  }

  return true;
}
