import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { DiscoverRequestCard, DiscoverRequestCardSkeleton } from '@/components/DiscoverRequestCard';
import { HomeRequestCard, HomeRequestCardSkeleton } from '@/components/HomeRequestCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { useProfile } from '@/features/profile/api';
import { useBrowseNearbyRequests, type PublicRequest } from '@/features/requests/browse-api';
import { useMyRequests } from '@/features/requests/requester-api';
import { useMyResponses } from '@/features/requests/responses-api';
import { requestOutcomeDescription } from '@/features/requests/outcome';
import { nearbyRequestBadge } from '@/features/requests/status';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import {
  formatCoarseLocationLabel,
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
const OPEN_REQUEST_STATUSES = new Set(['posted', 'searching']);
const NEARBY_SKELETON_COUNT = 3;

function NearbyFeedSkeleton({ home }: { home: boolean }) {
  return (
    <View className="gap-3">
      {Array.from({ length: NEARBY_SKELETON_COUNT }, (_, index) =>
        home ? (
          <HomeRequestCardSkeleton key={index} />
        ) : (
          <DiscoverRequestCardSkeleton key={index} />
        ),
      )}
    </View>
  );
}

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
  const myRequests = useMyRequests();
  const myResponses = useMyResponses();
  const profile = useProfile();

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

      async function ensurePosition() {
        setLocating(true);
        setBlocked(null);

        const permission = await readForegroundPermission();
        if (cancelled) return;

        if (permission === 'granted') {
          const next = await readPositionIfPermitted();
          if (cancelled) return;
          setLocating(false);
          if (next) {
            setPosition(next);
          } else {
            setBlocked('unavailable');
          }
          return;
        }

        if (permission === 'denied') {
          setLocating(false);
          setBlocked('denied');
          return;
        }

        const result = await requestPosition();
        if (cancelled) return;
        setLocating(false);
        if (result.ok) {
          setPosition(result.position);
          return;
        }

        setBlocked(result.reason === 'permission-denied' ? 'denied' : 'unavailable');
      }

      void ensurePosition();

      return () => {
        cancelled = true;
      };
    }, []),
  );

  const ownOpenRequestIds = useMemo(() => {
    const ids = new Set<string>();
    for (const request of myRequests.data ?? []) {
      if (OPEN_REQUEST_STATUSES.has(request.status)) {
        ids.add(request.request_id);
      }
    }
    return ids;
  }, [myRequests.data]);

  const rows = useMemo(() => {
    const browseRows = nearby.data ?? [];

    if (!isHome) {
      return browseRows.filter((request) => !engagedRequestIds.has(request.request_id));
    }

    const merged = new Map<string, PublicRequest>();
    for (const request of browseRows) {
      merged.set(request.request_id, request);
    }

    const profileRow = profile.data;
    for (const request of myRequests.data ?? []) {
      if (!OPEN_REQUEST_STATUSES.has(request.status)) continue;
      if (merged.has(request.request_id)) continue;

      merged.set(request.request_id, {
        request_id: request.request_id,
        title: request.title,
        description: request.description,
        scheduled_for: request.scheduled_for,
        offered_amount: request.offered_amount,
        currency: request.currency,
        location_label: request.location_label,
        distance_m: Number.MAX_SAFE_INTEGER,
        requester_display_name: profileRow?.display_name ?? null,
        requester_avatar_path: profileRow?.avatar_path ?? null,
        requester_rating_average: profileRow?.rating_average ?? null,
        requester_rating_count: profileRow?.rating_count ?? null,
      });
    }

    return [...merged.values()].sort((a, b) => {
      const distanceA = a.distance_m ?? Number.MAX_SAFE_INTEGER;
      const distanceB = b.distance_m ?? Number.MAX_SAFE_INTEGER;
      if (distanceA !== distanceB) return distanceA - distanceB;
      return a.title!.localeCompare(b.title!);
    });
  }, [nearby.data, engagedRequestIds, isHome, myRequests.data, profile.data]);

  const visible = limit !== undefined ? rows.slice(0, limit) : rows;
  const hasMore = limit !== undefined && rows.length > limit;

  const browseSkeleton = showQuerySkeleton(nearby);

  const nearbyFeed =
    position === null ? (
      locating ? (
        <NearbyFeedSkeleton home={isHome} />
      ) : blocked === 'denied' ? (
        <EmptyState
          layout="list"
          icon="location-outline"
          title="Turn on location"
          message="Enable location in Settings to see requests near you."
        />
      ) : (
        <EmptyState
          layout="list"
          icon="navigate-outline"
          title="Location unavailable"
          message="Pull to refresh and try again."
        />
      )
    ) : browseSkeleton ? (
      <NearbyFeedSkeleton home={isHome} />
    ) : nearby.isError ? (
      <InlineError error={nearby.error} />
    ) : rows.length === 0 ? (
      <EmptyState
        layout="list"
        icon="compass-outline"
        title="Nothing open nearby"
        message="New requests show up here when people nearby need help. Check back soon."
      />
    ) : (
      <>
        {visible.map((request) => {
          const waiting = myResponses.data?.some(
            (response) =>
              response.request_id === request.request_id &&
              response.response_status === 'pending' &&
              (response.request_status === 'posted' || response.request_status === 'searching'),
          );

          const isOwnRequest = ownOpenRequestIds.has(request.request_id);

          const openDetail = (startFlow?: boolean) => {
            if (isOwnRequest) {
              router.push(`/request/${request.request_id}`);
              return;
            }
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
          };

          const homeProximity = isOwnRequest
            ? 'Your request'
            : request.distance_m != null
              ? formatProximityHome(request.distance_m)
              : formatCoarseLocationLabel(request.location_label ?? '');

          if (isHome) {
            return (
              <HomeRequestCard
                key={request.request_id}
                title={request.title ?? 'Request'}
                description={requestOutcomeDescription(request.description)}
                amount={formatMoney(request.offered_amount!, request.currency)}
                whenLine={formatWhenHome(request.scheduled_for)}
                proximity={homeProximity}
                onPress={() => openDetail(false)}
                disabled={isOwnRequest ? false : Boolean(waiting)}
              />
            );
          }

          return (
            <DiscoverRequestCard
              key={request.request_id}
              title={request.title ?? 'Request'}
              description={requestOutcomeDescription(request.description)}
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
