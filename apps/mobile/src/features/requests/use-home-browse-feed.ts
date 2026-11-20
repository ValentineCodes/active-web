import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import {
  useBrowseOpenProjectsInfinite,
  type PublicProject,
} from '@/features/projects/project-browse-api';
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
  const projectsBrowseEnabled = activeSearch.length === 0;
  const openProjects = useBrowseOpenProjectsInfinite({ enabled: projectsBrowseEnabled });
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

  const projectRows = useMemo(() => {
    if (!projectsBrowseEnabled) return [];
    return (openProjects.data?.pages ?? []).flat();
  }, [openProjects.data?.pages, projectsBrowseEnabled]);

  const rows = useMemo((): HomeBrowseFeedRow[] => {
    if (!activeQuery) return [];
    const requests = activeQuery.data?.pages.flat() ?? [];
    const merged: { at: number; row: HomeBrowseFeedRow }[] = [];
    for (const request of requests) {
      merged.push({
        at: request.posted_at ? new Date(request.posted_at).getTime() : 0,
        row: { kind: 'request', request },
      });
    }
    for (const project of projectRows) {
      merged.push({
        at: project.posted_at ? new Date(project.posted_at).getTime() : 0,
        row: { kind: 'project', project },
      });
    }
    merged.sort((a, b) => b.at - a.at);
    return merged.map((entry) => entry.row);
  }, [activeQuery, projectRows]);

  const searchNeedsLocation =
    activeSearch.length > 0 && position === null && !locating && !sortingNearest;

  const loading =
    locating ||
    sortingNearest ||
    (activeSearch.length > 0
      ? showQuerySkeleton(search)
      : position
        ? showQuerySkeleton(nearby) || (projectsBrowseEnabled && showQuerySkeleton(openProjects))
        : openBrowseEnabled &&
          (showQuerySkeleton(open) ||
            (projectsBrowseEnabled && showQuerySkeleton(openProjects))));

  const showSortNearest =
    position === null &&
    activeSearch.length === 0 &&
    foregroundPermission === 'undetermined' &&
    !loading;

  const refetch = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.browseNearbyAll }),
      queryClient.invalidateQueries({ queryKey: queryKeys.browseOpenAll }),
      queryClient.invalidateQueries({ queryKey: queryKeys.browseOpenProjectsAll }),
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

export type HomeBrowseFeedRow =
  | { kind: 'request'; request: PublicRequest }
  | { kind: 'project'; project: PublicProject };
