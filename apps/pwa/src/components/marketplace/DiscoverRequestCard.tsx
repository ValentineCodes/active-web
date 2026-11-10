import Link from 'next/link';

import type { PublicRequest } from '@/features/requests/browse-api';
import { formatMoney, formatProximityHome, formatWhenHome } from '@/lib/format';

type Props = {
  request: PublicRequest;
  distanceM: number | null;
  isOwn: boolean;
  hasPendingResponse: boolean;
  positionLat?: number;
  positionLng?: number;
};

export function DiscoverRequestCard({
  request,
  distanceM,
  isOwn,
  hasPendingResponse,
  positionLat,
  positionLng,
}: Props) {
  const href = `/request/${request.request_id}${
    positionLat != null && positionLng != null ? `?lat=${positionLat}&lng=${positionLng}` : ''
  }`;

  const whenLabel = formatWhenHome(request.scheduled_for);
  const proximity =
    distanceM != null ? formatProximityHome(distanceM) : request.location_label ?? 'Nearby';
  const amount =
    request.offered_amount != null ? formatMoney(request.offered_amount, request.currency) : null;

  return (
    <Link
      href={href}
      className="block rounded-2xl border border-hairline bg-elevated p-4 active:opacity-90"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex-1 text-base font-semibold text-ink">{request.title}</h3>
        {amount ? <span className="text-sm font-semibold text-brand">{amount}</span> : null}
      </div>
      {request.description ? (
        <p className="mt-2 line-clamp-2 text-sm text-muted">{request.description}</p>
      ) : null}
      <p className="mt-3 text-xs text-subtle">
        {whenLabel} · {proximity}
      </p>
      {hasPendingResponse ? (
        <p className="mt-2 text-xs font-semibold text-brand">Response submitted</p>
      ) : null}
    </Link>
  );
}
