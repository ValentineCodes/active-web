import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { RequestCard } from '@/components/ui/RequestCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { InlineError } from '@/components/ui/StateView';
import { useBrowseNearbyRequests } from '@/features/requests/browse-api';
import { useMyResponses } from '@/features/requests/provider-api';
import { nearbyRequestBadge } from '@/features/requests/status';
import { formatDistance, formatMoney, formatWhen } from '@/lib/format';
import {
  readForegroundPermission,
  readPositionIfPermitted,
  requestPosition,
  type Position,
} from '@/lib/location';

export function NearbyRequests() {
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [blocked, setBlocked] = useState<'denied' | 'unavailable' | null>(null);

  const nearby = useBrowseNearbyRequests(position);
  const myResponses = useMyResponses();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      readForegroundPermission().then(async (permission) => {
        if (cancelled || permission !== 'granted') return;
        const next = await readPositionIfPermitted();
        if (!cancelled && next) {
          setPosition(next);
          setBlocked(null);
        }
      });

      return () => {
        cancelled = true;
      };
    }, []),
  );

  const shareLocation = async () => {
    setLocating(true);
    setBlocked(null);
    const result = await requestPosition();
    setLocating(false);

    if (result.ok) {
      setPosition(result.position);
      return;
    }

    setBlocked(result.reason === 'permission-denied' ? 'denied' : 'unavailable');
  };

  return (
    <View className="gap-3">
      <SectionHeader title="Nearby requests" />
      <Text className="text-sm text-muted">
        Open requests around you. Distance is approximate; who has responded stays private.
      </Text>

      {position === null ? (
        <View className="gap-3 rounded-2xl bg-surface p-4">
          <Text className="text-base text-ink">See what people near you need</Text>
          <Text className="text-sm text-muted">
            {blocked === 'denied'
              ? 'Location access is off. Enable it in Settings to browse nearby requests.'
              : 'Share your approximate location to browse open requests.'}
          </Text>
          <Button
            label={locating ? 'Getting location…' : 'Browse nearby'}
            loading={locating}
            onPress={() => void shareLocation()}
          />
        </View>
      ) : nearby.isPending ? (
        <ActivityIndicator />
      ) : nearby.isError ? (
        <InlineError error={nearby.error} />
      ) : nearby.data?.length === 0 ? (
        <Text className="text-sm text-muted">
          Nothing open near you right now. You can still make a request or check again later.
        </Text>
      ) : (
        nearby.data?.map((request) => {
          const waiting = myResponses.data?.some(
            (response) =>
              response.request_id === request.request_id &&
              response.response_status === 'pending' &&
              (response.request_status === 'posted' || response.request_status === 'searching'),
          );

          return (
            <RequestCard
              key={request.request_id}
              title={request.title ?? 'Request'}
              description={request.description ?? undefined}
              badge={nearbyRequestBadge(Boolean(waiting))}
              amount={formatMoney(request.offered_amount!, request.currency)}
              meta={[
                formatDistance(request.distance_m),
                request.location_label,
                formatWhen(request.scheduled_for),
              ]}
              onPress={() => router.push(`/respond/${request.request_id}`)}
            />
          );
        })
      )}
    </View>
  );
}
