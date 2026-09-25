import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RequestCard } from '@/components/ui/RequestCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { InlineError } from '@/components/ui/StateView';
import { useCategoryIndex } from '@/features/categories/api';
import { useBrowseNearbyRequests } from '@/features/requests/browse-api';
import { formatDistance, formatMoney, formatWhen } from '@/lib/format';
import {
  readForegroundPermission,
  readPositionIfPermitted,
  requestPosition,
  type Position,
} from '@/lib/location';
import { colors } from '@/theme';

/**
 * Open demand around the viewer. Location is read only after they ask, or silently
 * when they already allowed it. Cards stay on the public fields.
 */
export function NearbyRequests() {
  const categories = useCategoryIndex();
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [blocked, setBlocked] = useState<'denied' | 'unavailable' | null>(null);

  const nearby = useBrowseNearbyRequests(position);

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
        Open requests around you. Distance is approximate, and who has responded stays private.
      </Text>

      {position === null ? (
        <Card>
          <Text className="text-base text-ink">
            See what people nearby need, without going Active.
          </Text>
          <Text className="text-sm text-muted">
            Your location is used only to measure rough distance. Nobody sees where you are.
          </Text>
          {blocked === 'denied' ? (
            <Text className="text-sm text-warning">
              Location is off for Active. Turn it on to browse requests near you.
            </Text>
          ) : null}
          {blocked === 'unavailable' ? (
            <Text className="text-sm text-warning">
              Location could not be read. Check that location services are on, then try again.
            </Text>
          ) : null}
          <Button
            label={locating ? 'Finding you' : 'Show requests near me'}
            icon="location-outline"
            loading={locating}
            onPress={shareLocation}
          />
        </Card>
      ) : nearby.isPending ? (
        <Card>
          <View className="flex-row items-center gap-3" accessibilityRole="progressbar">
            <ActivityIndicator color={colors.brand} />
            <Text className="flex-1 text-base text-muted">Looking for requests near you</Text>
          </View>
        </Card>
      ) : nearby.isError ? (
        <Card>
          <InlineError error={nearby.error} />
          <Button label="Try again" variant="secondary" onPress={() => nearby.refetch()} />
        </Card>
      ) : nearby.data.length === 0 ? (
        <Card>
          <Text className="text-base font-semibold text-ink">Nothing open nearby</Text>
          <Text className="text-sm text-muted">
            When someone near you asks for help, it shows up here. You can still make a request or
            go Active.
          </Text>
        </Card>
      ) : (
        nearby.data.map((request) => {
          const category = categories.data?.get(request.category_slug);

          return (
            <RequestCard
              key={request.request_id}
              icon={category?.icon}
              title={category?.label ?? request.category_slug}
              description={request.description}
              amount={
                request.offered_amount !== null
                  ? formatMoney(request.offered_amount, request.currency)
                  : 'Open to offers'
              }
              meta={[
                formatDistance(request.distance_m),
                request.location_label,
                formatWhen(request.scheduled_for),
              ]}
              onPress={() => router.push(`/nearby/${request.request_id}`)}
            />
          );
        })
      )}
    </View>
  );
}
