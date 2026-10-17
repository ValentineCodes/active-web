import { View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { responderAvailabilityBadge } from '@/features/requests/status';

/** Requester-facing hint: availability for this request's scheduled time only. */
export function ResponderScheduleAvailability({ available }: { available: boolean }) {
  if (available) return null;

  const badge = responderAvailabilityBadge(available);

  return (
    <View className="self-start">
      <Badge label={badge.label} tone={badge.tone} dot={false} />
    </View>
  );
}
