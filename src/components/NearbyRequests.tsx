import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { DiscoverRequestCard } from '@/components/DiscoverRequestCard';
import { HomeRequestCard } from '@/components/HomeRequestCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { InlineError } from '@/components/ui/StateView';
import { useBrowseNearbyRequests } from '@/features/requests/browse-api';
import { useMyResponses } from '@/features/requests/responses-api';
import { nearbyRequestBadge } from '@/features/requests/status';
import {
  formatMoney,
  formatProximity,
  formatProximityHome,
  formatWhenDiscover,
  formatWhenHome,
} from '@/lib/format';
import {
  readForegroundPermission,
  readPositionIfPermitted,
  requestPosition,
  type Position,
} from '@/lib/location';

const BROWSE_HIDDEN_RESPONSE_STATUSES = new Set(['pending', 'accepted', 'declined']);

type NearbyRequestsProps = {
  /** Cap list length on dense screens (e.g. Home). */
  limit?: number;
  sectionTitle?: string;
  /** When set, shows a footer action after the list. */
  seeAllLabel?: string;
  onSeeAll?: () => void;
  /** Shorter copy when embedded under the home hero. */
  compact?: boolean;
  /** Home feed styling — no section chrome, serif cards. */
  variant?: 'default' | 'home';
};

export function NearbyRequests({
  limit,
  sectionTitle = 'Open near you',
  seeAllLabel,
  onSeeAll,
  compact = false,
  variant = 'default',
}: NearbyRequestsProps) {
  const isHome = variant === 'home';
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [blocked, setBlocked] = useState<'denied' | 'unavailable' | null>(null);

  const nearby = useBrowseNearbyRequests(position);
  const myResponses = useMyResponses();

  const engagedRequestIds = useMemo(() => {
    const ids = new Set<string>();
    for (const response of myResponses.data ?? []) {
      if (BROWSE_HIDDEN_RESPONSE_STATUSES.has(response.response_status)) {
        ids.add(response.request_id);
      }
    }
    return ids;
  }, [myResponses.data]);

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

  const rows = (nearby.data ?? []).filter((request) => !engagedRequestIds.has(request.request_id));
  const visible = limit !== undefined ? rows.slice(0, limit) : rows;
  const hasMore = limit !== undefined && rows.length > limit;

  const nearbyFeed =
    position === null ? (
      <View className="gap-3 rounded-2xl bg-surface p-4">
        <Text className="text-base font-medium text-ink">Browse what is open nearby</Text>
        <Text className="text-sm text-muted">
          {blocked === 'denied'
            ? 'Location access is off. Enable it in Settings to see nearby requests.'
            : 'Location is only used to sort what is relevant near you — not shared on the list.'}
        </Text>
        <Button
          label={locating ? 'Getting location…' : 'Show nearby requests'}
          loading={locating}
          onPress={() => void shareLocation()}
        />
      </View>
    ) : nearby.isPending ? (
      <ActivityIndicator />
    ) : nearby.isError ? (
      <InlineError error={nearby.error} />
    ) : rows.length === 0 ? (
      <Text className="text-sm text-muted">
        {isHome
          ? 'Nothing open near you right now. Check back later — or post a request.'
          : 'Nothing open near you right now. Check back later — or ask for help on Home.'}
      </Text>
    ) : (
      <>
        {visible.map((request) => {
          const waiting = myResponses.data?.some(
            (response) =>
              response.request_id === request.request_id &&
              response.response_status === 'pending' &&
              (response.request_status === 'posted' || response.request_status === 'searching'),
          );

          const openDetail = (startFlow?: boolean) =>
            router.push({
              pathname: '/respond/[id]',
              params: {
                id: request.request_id,
                ...(position
                  ? { lat: String(position.latitude), lng: String(position.longitude) }
                  : {}),
                ...(startFlow ? { start: '1' } : {}),
              },
            });

          if (isHome) {
            return (
              <HomeRequestCard
                key={request.request_id}
                title={request.title ?? 'Request'}
                description={request.description}
                amount={formatMoney(request.offered_amount!, request.currency)}
                whenLine={formatWhenHome(request.scheduled_for)}
                proximity={formatProximityHome(request.distance_m)}
                onPress={() => openDetail(false)}
                disabled={Boolean(waiting)}
              />
            );
          }

          return (
            <DiscoverRequestCard
              key={request.request_id}
              title={request.title ?? 'Request'}
              description={request.description}
              badge={nearbyRequestBadge(Boolean(waiting))}
              amount={formatMoney(request.offered_amount!, request.currency)}
              whenLine={formatWhenDiscover(request.scheduled_for)}
              proximity={formatProximity(request.distance_m)}
              onOpen={() => openDetail(false)}
              onHelp={() => openDetail(true)}
            />
          );
        })}
        {seeAllLabel && onSeeAll && (hasMore || rows.length > 0) ? (
          <Pressable
            onPress={onSeeAll}
            accessibilityRole="button"
            accessibilityLabel={seeAllLabel}
            className="py-2"
          >
            <Text className="text-center text-sm font-semibold text-brand">{seeAllLabel}</Text>
          </Pressable>
        ) : null}
      </>
    );

  return (
    <View className="gap-3">
      {!isHome ? (
        <SectionHeader
          title={sectionTitle}
          actionLabel={seeAllLabel && hasMore ? seeAllLabel : undefined}
          onAction={hasMore ? onSeeAll : undefined}
        />
      ) : null}

      {!compact && !isHome ? (
        <Text className="text-sm text-muted">
          People nearby posted these. Tap one to respond — your exact location stays private until
          you are selected.
        </Text>
      ) : null}

      {nearbyFeed}
    </View>
  );
}
