import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { DiscoverRequestCard, DiscoverRequestCardSkeleton } from '@/components/DiscoverRequestCard';
import { HomeRequestCard, HomeRequestCardSkeleton } from '@/components/HomeRequestCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import {
  useBrowseNearbyRequests,
  useBrowseOpenRequests,
  useSearchRequests,
} from '@/features/requests/browse-api';
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
  type ForegroundPermission,
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

function SortByNearestButton({ loading, onPress }: { loading: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel="Sort by nearest"
      className="self-start py-1"
    >
      <Text className="text-sm font-semibold text-brand">
        {loading ? 'Getting location…' : 'Sort by nearest'}
      </Text>
    </Pressable>
  );
}

type NearbyRequestsProps = {
  limit?: number;
  sectionTitle?: string;
  seeAllLabel?: string;
  onSeeAll?: () => void;
  compact?: boolean;
  variant?: 'default' | 'home';
  searchQuery?: string | null;
};

export function NearbyRequests({
  limit,
  sectionTitle = 'Open near you',
  seeAllLabel,
  onSeeAll,
  compact = false,
  variant = 'default',
  searchQuery = null,
}: NearbyRequestsProps) {
  const isHome = variant === 'home';
  const screenFocusedRef = useRef(false);
  const activeSearch = searchQuery?.trim() ?? '';
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(true);
  const [foregroundPermission, setForegroundPermission] = useState<ForegroundPermission | null>(
    null,
  );
  const [blocked, setBlocked] = useState<'denied' | 'unavailable' | null>(null);
  const [sortingNearest, setSortingNearest] = useState(false);

  const openBrowseEnabled = isHome && position === null && activeSearch.length === 0;
  const open = useBrowseOpenRequests({ enabled: openBrowseEnabled });
  const nearby = useBrowseNearbyRequests(position);
  const search = useSearchRequests(activeSearch, position);
  const myRequests = useMyRequests();
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

  const syncLocationAccess = useCallback(async () => {
    const permission = await readForegroundPermission();
    setForegroundPermission(permission);

    if (permission !== 'granted') {
      return { permission, position: null as Position | null };
    }

    const next = await readPositionIfPermitted();
    if (next) {
      setPosition(next);
    }

    return { permission, position: next };
  }, []);

  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true;
      let cancelled = false;

      async function ensurePosition() {
        setLocating(true);
        setBlocked(null);

        const access = await syncLocationAccess();
        if (cancelled) return;
        setLocating(false);

        if (access.permission === 'granted') {
          if (!isHome && !access.position) {
            setBlocked('unavailable');
          }
          return;
        }

        if (isHome) {
          return;
        }

        if (access.permission === 'denied') {
          setBlocked('denied');
          return;
        }

        const result = await requestPosition();
        if (cancelled) return;
        const afterPrompt = await syncLocationAccess();
        if (cancelled) return;

        if (afterPrompt.permission === 'granted' || result.ok) {
          if (result.ok) {
            setPosition(result.position);
          }
          return;
        }

        setBlocked(result.reason === 'permission-denied' ? 'denied' : 'unavailable');
      }

      void ensurePosition();

      return () => {
        screenFocusedRef.current = false;
        cancelled = true;
      };
    }, [isHome, syncLocationAccess]),
  );

  useEffect(() => {
    if (!isHome) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && screenFocusedRef.current) {
        void syncLocationAccess();
      }
    });

    return () => subscription.remove();
  }, [isHome, syncLocationAccess]);

  const sortByNearest = useCallback(async () => {
    setSortingNearest(true);
    setBlocked(null);

    const permission = await readForegroundPermission();
    setForegroundPermission(permission);
    if (permission === 'denied') {
      setSortingNearest(false);
      void Linking.openSettings();
      return;
    }

    const result = await requestPosition();
    await syncLocationAccess();
    setSortingNearest(false);

    if (result.ok) {
      setPosition(result.position);
    }
  }, [syncLocationAccess]);

  const ownOpenRequestIds = useMemo(() => {
    const ids = new Set<string>();
    for (const request of myRequests.data ?? []) {
      if (OPEN_REQUEST_STATUSES.has(request.status)) {
        ids.add(request.request_id);
      }
    }
    return ids;
  }, [myRequests.data]);

  const browseRows = useMemo(() => {
    const rows = position ? (nearby.data ?? []) : isHome ? (open.data ?? []) : [];
    if (isHome) return rows;
    return rows.filter((request) => !engagedRequestIds.has(request.request_id));
  }, [nearby.data, open.data, position, engagedRequestIds, isHome]);

  const searchRows = search.data ?? [];
  const searchHasResults = activeSearch.length > 0 && searchRows.length > 0;
  const searchLoading = activeSearch.length > 0 && showQuerySkeleton(search);
  const searchNoResults =
    activeSearch.length > 0 &&
    !searchLoading &&
    search.isFetched &&
    searchRows.length === 0 &&
    !search.isError;

  const rows = searchHasResults ? searchRows : browseRows;

  const visible = limit !== undefined ? rows.slice(0, limit) : rows;
  const hasMore = limit !== undefined && rows.length > limit;

  const browseSkeleton = position
    ? !activeSearch && showQuerySkeleton(nearby)
    : isHome && openBrowseEnabled && showQuerySkeleton(open);

  const showHomeSortButton =
    isHome && position === null && !searchHasResults && foregroundPermission === 'undetermined';

  const renderRequestList = () => (
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
            proximity={
              request.distance_m != null
                ? formatProximity(request.distance_m)
                : formatCoarseLocationLabel(request.location_label ?? '')
            }
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

  const homeSearchNeedsLocation =
    isHome && activeSearch.length > 0 && position === null && !searchHasResults;

  const nearbyFeed = homeSearchNeedsLocation ? (
    <View className="gap-3">
      {showHomeSortButton ? (
        <SortByNearestButton
          loading={sortingNearest || locating}
          onPress={() => void sortByNearest()}
        />
      ) : null}
      {sortingNearest || locating ? (
        <NearbyFeedSkeleton home={isHome} />
      ) : foregroundPermission === 'granted' ? (
        <Text className="text-sm text-muted">
          We could not get your location. Pull to refresh to try again.
        </Text>
      ) : (
        <Text className="text-sm text-muted">Allow location to search open requests near you.</Text>
      )}
    </View>
  ) : position === null && !isHome ? (
    locating ? (
      <NearbyFeedSkeleton home={isHome} />
    ) : blocked === 'denied' ? (
      <EmptyState
        layout="list"
        icon="location-outline"
        title="Turn on location"
        message="Enable location in Settings to see open requests sorted by distance."
      />
    ) : (
      <EmptyState
        layout="list"
        icon="navigate-outline"
        title="Location unavailable"
        message="Pull to refresh and try again."
      />
    )
  ) : searchLoading ? (
    <NearbyFeedSkeleton home={isHome} />
  ) : activeSearch && search.isError ? (
    <InlineError error={search.error} />
  ) : browseSkeleton && !searchNoResults ? (
    <NearbyFeedSkeleton home={isHome} />
  ) : !activeSearch && position && nearby.isError ? (
    <InlineError error={nearby.error} />
  ) : !activeSearch && !position && isHome && open.isError ? (
    <InlineError error={open.error} />
  ) : rows.length === 0 ? (
    <EmptyState
      layout="list"
      icon="compass-outline"
      title="Nothing open right now"
      message="New requests show up here when people need help. Check back soon."
    />
  ) : (
    <View className="gap-3">
      {showHomeSortButton ? (
        <SortByNearestButton loading={sortingNearest} onPress={() => void sortByNearest()} />
      ) : null}
      {renderRequestList()}
    </View>
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

      {searchNoResults ? (
        <View className="rounded-2xl bg-surface px-4 py-3">
          <Text className="text-center text-sm font-semibold text-ink">No matching result</Text>
        </View>
      ) : null}

      {nearbyFeed}
    </View>
  );
}
