'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { HomeFeedProjectPage } from '@/components/home/HomeFeedProjectPage';
import { HomeFeedRequestPage, HomeFeedRequestPageSkeleton } from '@/components/home/HomeFeedRequestPage';
import {
  PersonProfileSheet,
  personProfileFromPublicRequest,
  type PersonProfilePreview,
} from '@/components/profile/PersonProfileSheet';
import { proximityLabelForRequest } from '@/features/requests/proximity-label';
import { IonIcon } from '@/components/ui/IonIcon';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { ionIcons } from '@/components/ui/ion-icons';
import { useHomeBrowseFeed, type HomeBrowseFeedRow } from '@/features/requests/use-home-browse-feed';
import type { PublicRequest } from '@/features/requests/browse-api';
import { useHomeFeedTabBarInset } from '@/components/ui/tab-bar-insets';
import { useElementScrollRestoration } from '@/lib/navigation/use-element-scroll-restoration';
import { useColors } from '@/theme/ThemeProvider';

type Props = {
  searchQuery: string;
};

export function HomeFeed({ searchQuery }: Props) {
  const feed = useHomeBrowseFeed(searchQuery, true);
  const tabBarInset = useHomeFeedTabBarInset();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pageHeight, setPageHeight] = useState(0);
  const [profilePreview, setProfilePreview] = useState<PersonProfilePreview | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const openRequesterProfile = useCallback((request: PublicRequest) => {
    setProfilePreview(personProfileFromPublicRequest(request));
    setProfileOpen(true);
  }, []);
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

  const listReady = pageHeight > 0;
  const scrollReady = listReady && feed.rows.length > 0;
  const onPersistScroll = useElementScrollRestoration('screen:home-feed', scrollRef, scrollReady);

  const onScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      onPersistScroll(event);
      if (pageHeight < 1 || !feed.hasNextPage || feed.isFetchingNextPage) return;
      const index = Math.round(event.currentTarget.scrollTop / pageHeight);
      if (index >= feed.rows.length - 2) feed.fetchNextPage();
    },
    [feed, onPersistScroll, pageHeight],
  );

  return (
    <div ref={containerRef} className="relative flex min-h-0 flex-1 flex-col bg-canvas">
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
        <FeedEmptyBody className="min-h-0 flex-1" />
      ) : listReady ? (
        <div
          ref={scrollRef}
          className="h-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain bg-canvas [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={onScroll}
        >
          {feed.rows.map((item) => (
            <HomeFeedRowPage
              key={rowKey(item)}
              item={item}
              feed={feed}
              pageHeight={pageHeight}
              tabBarInset={tabBarInset}
              onRequesterPress={openRequesterProfile}
            />
          ))}
        </div>
      ) : null}

      <PersonProfileSheet
        open={profileOpen}
        profile={profilePreview}
        onClose={() => setProfileOpen(false)}
      />
    </div>
  );
}

function rowKey(item: HomeBrowseFeedRow): string {
  return item.kind === 'request' ? item.request.request_id : item.project.project_id;
}

function HomeFeedRowPage({
  item,
  feed,
  pageHeight,
  tabBarInset,
  onRequesterPress,
}: {
  item: HomeBrowseFeedRow;
  feed: ReturnType<typeof useHomeBrowseFeed>;
  pageHeight: number;
  tabBarInset: number;
  onRequesterPress: (request: PublicRequest) => void;
}) {
  if (item.kind === 'project') {
    return (
      <HomeFeedProjectPage project={item.project} pageHeight={pageHeight} tabBarInset={tabBarInset} />
    );
  }

  const request = item.request;
  const isOwnRequest = feed.ownOpenRequestIds.has(request.request_id);
  const waiting = Boolean(
    feed.myResponses?.some(
      (response) =>
        response.request_id === request.request_id &&
        response.response_status === 'pending' &&
        (response.request_status === 'posted' || response.request_status === 'searching'),
    ),
  );

  return (
    <HomeFeedRequestPage
      request={request}
      pageHeight={pageHeight}
      proximityLabel={proximityLabelForRequest(request, isOwnRequest)}
      isOwnRequest={isOwnRequest}
      waiting={waiting}
      browsePosition={feed.position}
      onRequesterPress={() => onRequesterPress(request)}
      tabBarInset={tabBarInset}
    />
  );
}

function FeedEmptyBody({ className }: { className?: string }) {
  const colors = useColors();
  return (
    <div
      className={`flex flex-col items-center justify-center px-5 pb-8 text-center ${className ?? ''}`}
    >
      <div className="flex w-full max-w-xs flex-col items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft">
          <IonIcon icon={ionIcons['compass-outline']} size={24} color={colors.brand} />
        </div>
        <p className="text-base font-semibold text-ink">Nothing open right now</p>
        <p className="text-sm leading-5 text-muted">
          Open requests and live projects show up here. Check back soon.
        </p>
      </div>
    </div>
  );
}
