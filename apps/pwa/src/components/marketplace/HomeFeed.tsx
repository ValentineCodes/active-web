import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { HomeFeedRequestPage, HomeFeedRequestPageSkeleton } from '@/components/home/HomeFeedRequestPage';
import { proximityLabelForRequest } from '@/features/requests/proximity-label';
import { IonIcon } from '@/components/ui/IonIcon';
import { TAB_BAR_HEIGHT } from '@/components/ui/tab-bar-insets';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { ionIcons } from '@/components/ui/ion-icons';
import { useHomeBrowseFeed } from '@/features/requests/use-home-browse-feed';

type Props = {
  searchQuery: string;
};

export function HomeFeed({ searchQuery }: Props) {
  const navigate = useNavigate();
  const feed = useHomeBrowseFeed(searchQuery, true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pageHeight, setPageHeight] = useState(0);
  const tabBarInset = TAB_BAR_HEIGHT + 8;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const next = Math.round(el.clientHeight);
      if (next > 0) setPageHeight(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (pageHeight < 1 || !feed.hasNextPage || feed.isFetchingNextPage) return;
      const index = Math.round(event.currentTarget.scrollTop / pageHeight);
      if (index >= feed.rows.length - 2) feed.fetchNextPage();
    },
    [feed, pageHeight],
  );

  const listReady = pageHeight > 0;
  const showFeedSearch = !feed.searchNeedsLocation;

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1 bg-canvas">
      {feed.isError ? (
        <div className="px-5 pt-4">
          <InlineError error={feed.error} onRetry={() => void feed.refetch()} />
        </div>
      ) : null}

      {feed.searchNeedsLocation ? (
        <div className="flex flex-1 flex-col justify-center px-5 pb-8">
          <EmptyState
            layout="list"
            icon="location-outline"
            title="Location needed to search"
            message="Allow location to search open requests near you."
            action={{ label: 'Enable location', onPress: () => void feed.sortByNearest() }}
          />
        </div>
      ) : feed.loading && feed.rows.length === 0 ? (
        listReady ? (
          <HomeFeedRequestPageSkeleton pageHeight={pageHeight} />
        ) : null
      ) : !feed.loading && feed.rows.length === 0 ? (
        <FeedEmptyList feed={feed} />
      ) : listReady ? (
        <div
          className="h-full snap-y snap-mandatory overflow-y-auto bg-canvas"
          style={{ scrollPaddingBottom: tabBarInset }}
          onScroll={onScroll}
        >
          {feed.rows.map((item) => {
            const isOwnRequest = feed.ownOpenRequestIds.has(item.request_id);
            const waiting = Boolean(
              feed.myResponses?.some(
                (response) =>
                  response.request_id === item.request_id &&
                  response.response_status === 'pending' &&
                  (response.request_status === 'posted' || response.request_status === 'searching'),
              ),
            );
            return (
              <HomeFeedRequestPage
                key={item.request_id}
                request={item}
                pageHeight={pageHeight}
                proximityLabel={proximityLabelForRequest(item, isOwnRequest)}
                isOwnRequest={isOwnRequest}
                waiting={waiting}
              />
            );
          })}
        </div>
      ) : null}

      {showFeedSearch ? (
        <button
          type="button"
          aria-label="Search requests"
          onClick={() =>
            navigate(searchQuery ? `/search?q=${encodeURIComponent(searchQuery)}` : '/search')
          }
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 active:opacity-90"
        >
          <IonIcon icon={ionIcons['search-outline']} size={20} color="#ffffff" />
        </button>
      ) : null}
    </div>
  );
}

function FeedEmptyList({ feed }: { feed: ReturnType<typeof useHomeBrowseFeed> }) {
  return (
    <FeedEmptyBody showSortNearest={feed.showSortNearest} onSortNearest={() => void feed.sortByNearest()} />
  );
}

function FeedEmptyBody({
  showSortNearest,
  onSortNearest,
}: {
  showSortNearest: boolean;
  onSortNearest: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center px-5 pb-8">
      {showSortNearest ? (
        <button
          type="button"
          onClick={onSortNearest}
          className="mb-4 self-start py-1 text-sm font-semibold text-brand"
        >
          Sort by nearest
        </button>
      ) : null}
      <EmptyState
        layout="list"
        icon="compass-outline"
        title="Nothing open right now"
        message="New requests show up here when people need help. Check back soon."
      />
    </div>
  );
}
