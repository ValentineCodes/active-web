import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import {
  useBrowseNearbyRequestsInfinite,
  useBrowseOpenRequestsInfinite,
  useSearchRequestsInfinite,
  type PublicRequest,
} from '@/features/requests/browse-api';
import { useMyRequests } from '@/features/requests/requester-api';
import { useMyResponses } from '@/features/requests/responses-api';
import { queryKeys } from '@/lib/query/keys';
import { showQuerySkeleton } from '@/lib/query/show-skeleton';
import {
  readForegroundPermission,
  readPositionIfPermitted,
  requestPosition,
  type ForegroundPermission,
  type Position,
} from '@/lib/location';

const OPEN_REQUEST_STATUSES = new Set(['posted', 'searching']);

export function useHomeBrowseFeed(searchQuery: string) {
  const queryClient = useQueryClient();
  const activeSearch = searchQuery.trim();
  const screenFocusedRef = useRef(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(true);
  const [foregroundPermission, setForegroundPermission] = useState<ForegroundPermission | null>(
    null,
  );
  const [sortingNearest, setSortingNearest] = useState(false);

  const openBrowseEnabled = position === null && activeSearch.length === 0;
  const open = useBrowseOpenRequestsInfinite({ enabled: openBrowseEnabled });
  const nearby = useBrowseNearbyRequestsInfinite(position);
  const search = useSearchRequestsInfinite(activeSearch, position);
  const myRequests = useMyRequests();
  const myResponses = useMyResponses();

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

        await syncLocationAccess();
        if (cancelled) return;
        setLocating(false);
      }

      void ensurePosition();

      return () => {
        screenFocusedRef.current = false;
        cancelled = true;
      };
    }, [syncLocationAccess]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && screenFocusedRef.current) {
        void syncLocationAccess();
      }
    });

    return () => subscription.remove();
  }, [syncLocationAccess]);

  const sortByNearest = useCallback(async () => {
    setSortingNearest(true);

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

  const activeQuery =
    activeSearch.length > 0 ? search : position ? nearby : openBrowseEnabled ? open : null;

  const rows = useMemo(() => {
    if (!activeQuery) return [];
    const pages = activeQuery.data?.pages ?? [];
    return pages.flat();
  }, [activeQuery]);

  const searchNeedsLocation =
    activeSearch.length > 0 && position === null && !locating && !sortingNearest;

  const loading =
    locating ||
    sortingNearest ||
    (activeSearch.length > 0
      ? showQuerySkeleton(search)
      : position
        ? showQuerySkeleton(nearby)
        : openBrowseEnabled && showQuerySkeleton(open));

  const showSortNearest =
    position === null &&
    activeSearch.length === 0 &&
    foregroundPermission === 'undetermined' &&
    !loading;

  const refetch = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.browseNearbyAll }),
      queryClient.invalidateQueries({ queryKey: queryKeys.browseOpenAll }),
      queryClient.invalidateQueries({ queryKey: queryKeys.requestSearchAll }),
      myRequests.refetch(),
      myResponses.refetch(),
    ]);
  }, [myRequests, myResponses, queryClient]);

  const fetchNextPage = useCallback(() => {
    if (!activeQuery?.hasNextPage || activeQuery.isFetchingNextPage) return;
    void activeQuery.fetchNextPage();
  }, [activeQuery]);

  return {
    rows,
    position,
    loading,
    error: activeQuery?.error ?? null,
    isError: activeQuery?.isError ?? false,
    refetch,
    fetchNextPage,
    hasNextPage: activeQuery?.hasNextPage ?? false,
    isFetchingNextPage: activeQuery?.isFetchingNextPage ?? false,
    searchNeedsLocation,
    showSortNearest,
    sortByNearest,
    ownOpenRequestIds,
    myResponses: myResponses.data,
    foregroundPermission,
  };
}

export type HomeBrowseFeedRow = PublicRequest;
