import { Badge } from '@/components/ui/Badge';
import { responderAvailabilityBadge } from '@/features/requests/status';

export function ResponderScheduleAvailability({ available }: { available: boolean }) {
  if (available) return null;

  const badge = responderAvailabilityBadge(available);

  return (
    <div className="self-start">
      <Badge label={badge.label} tone={badge.tone} dot={false} />
    </div>
  );
}
