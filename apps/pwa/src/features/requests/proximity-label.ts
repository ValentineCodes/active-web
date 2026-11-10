import type { PublicRequest } from '@/features/requests/browse-api';
import { formatCoarseLocationLabel, formatProximityHome } from '@/lib/format';

export function proximityLabelForRequest(request: PublicRequest, isOwnRequest: boolean): string {
  if (isOwnRequest) return 'Your request';
  if (request.distance_m != null) return formatProximityHome(request.distance_m);
  return formatCoarseLocationLabel(request.location_label ?? 'Nearby');
}
