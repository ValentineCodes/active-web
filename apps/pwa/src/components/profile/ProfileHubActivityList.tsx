'use client';

import Link from '@/components/AppLink';
import { useCallback, useMemo, useState, type ReactNode, type UIEvent } from 'react';

import { ActivityStatusFilter } from '@/components/activity/ActivityStatusFilter';
import { useActivityFeed } from '@/components/activity/useActivityFeed';
import { ActivityMyRequestCard, ActivityMyResponseCard } from '@/components/activity/ActivityTabCards';
import { ActivityCardListSkeleton } from '@/components/ui/content-skeletons';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { MARKET } from '@/config/index';
import {
  MY_REQUEST_ACTIVITY_FILTER_OPTIONS,
  MY_RESPONSE_ACTIVITY_FILTER_OPTIONS,
  type MyRequestActivityFilter,
  type MyResponseActivityFilter,
  myRequestMatchesActivityFilter,
  myResponseMatchesActivityFilter,
} from '@/features/requests/activity-filters';
import {
  activityAmountLabel,
  myRequestActivityBadge,
  myRequestActivityDetail,
  myResponseActivityBadge,
  myResponseActivityMetaLine,
  myResponseActivityOfferLine,
  requestNavigationPath,
} from '@/features/requests/activity-list';
import { useMyCreatedProjects, useMyProjectAssignments } from '@/features/projects/project-api';
import { isWorkerActiveAssignmentStatus } from '@/features/projects/project-worker-work';
import { formatMoney } from '@/lib/format';
import { useClientPagination } from '@/lib/hooks/use-client-pagination';
import { useRouter } from '@/lib/navigation';
import { readAppTabBarInset } from '@/components/ui/tab-bar-insets';

import type { ProfileHubTab } from '@/components/profile/ProfileStickyTabs';

const PAGE_SIZE = 20;
const SCROLL_LOAD_THRESHOLD_PX = 240;

type Props = {
  activeTab: ProfileHubTab;
  listHeader: ReactNode;
};

export function ProfileHubActivityList({ activeTab, listHeader }: Props) {
  const router = useRouter();
  const scrollPadding = readAppTabBarInset(24);

  const activity = useActivityFeed();
  const projects = useMyCreatedProjects();
  const projectAssignments = useMyProjectAssignments({
    enabled: activeTab === 'responses',
  });

  const [requestFilter, setRequestFilter] = useState<MyRequestActivityFilter>('all');
  const [responseFilter, setResponseFilter] = useState<MyResponseActivityFilter>('all');

  const filteredRequests = useMemo(
    () =>
      activity.myRequests.filter((request) => myRequestMatchesActivityFilter(request, requestFilter)),
    [activity.myRequests, requestFilter],
  );

  const filteredResponses = useMemo(
    () =>
      activity.myResponses.filter((response) =>
        myResponseMatchesActivityFilter(response, responseFilter),
      ),
    [activity.myResponses, responseFilter],
  );

  const activeProjectAssignments = useMemo(
    () =>
      (projectAssignments.data ?? []).filter((row) => isWorkerActiveAssignmentStatus(row.status)),
    [projectAssignments.data],
  );

  const projectRows = useMemo(() => projects.data ?? [], [projects.data]);

  const requestPage = useClientPagination(
    filteredRequests,
    PAGE_SIZE,
    `requests:${requestFilter}:${filteredRequests.length}`,
  );
  const responsePage = useClientPagination(
    filteredResponses,
    PAGE_SIZE,
    `responses:${responseFilter}:${filteredResponses.length}`,
  );
  const projectPage = useClientPagination(
    projectRows,
    PAGE_SIZE,
    `projects:${projectRows.length}`,
  );

  const tabState = useMemo(() => {
    if (activeTab === 'requests') {
      return {
        hasMore: requestPage.hasMore,
        loadMore: requestPage.loadMore,
        isLoading: activity.isLoading,
        isError: activity.isError,
        showRequestFilter: true,
        showResponseFilter: false,
        itemCount: requestPage.visibleItems.length,
      };
    }
    if (activeTab === 'responses') {
      return {
        hasMore: responsePage.hasMore,
        loadMore: responsePage.loadMore,
        isLoading: activity.isLoading,
        isError: activity.isError,
        showRequestFilter: false,
        showResponseFilter: true,
        itemCount: responsePage.visibleItems.length,
      };
    }
    return {
      hasMore: projectPage.hasMore,
      loadMore: projectPage.loadMore,
      isLoading: projects.isPending,
      isError: projects.isError,
      showRequestFilter: false,
      showResponseFilter: false,
      itemCount: projectPage.visibleItems.length,
    };
  }, [
    activeTab,
    activity.isError,
    activity.isLoading,
    projectPage,
    projects.isError,
    projects.isPending,
    requestPage,
    responsePage,
  ]);

  const { hasMore, loadMore, isLoading, isError, showRequestFilter, showResponseFilter, itemCount } =
    tabState;

  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_LOAD_THRESHOLD_PX) {
        loadMore();
      }
    },
    [loadMore],
  );

  const listFilter = (
    <>
      {showRequestFilter ? (
        <ActivityStatusFilter
          value={requestFilter}
          options={MY_REQUEST_ACTIVITY_FILTER_OPTIONS}
          onChange={setRequestFilter}
        />
      ) : null}
      {showResponseFilter ? (
        <ActivityStatusFilter
          value={responseFilter}
          options={MY_RESPONSE_ACTIVITY_FILTER_OPTIONS}
          onChange={setResponseFilter}
        />
      ) : null}
    </>
  );

  const emptyContent = useMemo(() => {
    if (isLoading) {
      return <ActivityCardListSkeleton count={4} />;
    }
    if (activeTab === 'projects') {
      if (isError) {
        return <InlineError error={projects.error} onRetry={() => void projects.refetch()} />;
      }
      return (
        <EmptyState
          layout="list"
          icon="people-outline"
          title="No projects on your profile yet"
          message="Collaborative projects you create will appear here."
          action={{ label: 'Create project', onPress: () => router.push('/project/new') }}
        />
      );
    }
    if (isError) {
      return (
        <InlineError
          error={
            activeTab === 'requests' ? 'Could not load requests.' : 'Could not load responses.'
          }
          onRetry={() => void activity.refetchAll()}
        />
      );
    }
    if (activeTab === 'requests') {
      if (activity.myRequests.length === 0) {
        return (
          <EmptyState
            layout="list"
            icon="add-circle-outline"
            title="No requests yet"
            message="Post a request when you need help nearby."
            action={{ label: 'Create request', onPress: () => router.push('/request/new') }}
          />
        );
      }
      return (
        <EmptyState
          layout="list"
          icon="filter-outline"
          title="No matches"
          message="Nothing in this status right now. Try another filter."
        />
      );
    }
    if (activity.myResponses.length === 0) {
      return (
        <EmptyState
          layout="list"
          icon="chatbubble-outline"
          title="No responses yet"
          message="Browse nearby on Home and respond when something fits."
          action={{ label: 'Go to Home', onPress: () => router.push('/home') }}
        />
      );
    }
    return (
      <EmptyState
        layout="list"
        icon="filter-outline"
        title="No matches"
        message="Nothing in this status right now. Try another filter."
      />
    );
  }, [
    activeTab,
    activity.myRequests.length,
    activity.myResponses.length,
    activity.refetchAll,
    isError,
    isLoading,
    projects.error,
    projects.refetch,
    router,
  ]);

  const listBody =
    activeTab === 'requests' ? (
      <div className="flex flex-col gap-3">
        {requestPage.visibleItems.map((request) => (
          <ActivityMyRequestCard
            key={request.request_id}
            title={request.title ?? 'Request'}
            detail={myRequestActivityDetail({
              status: request.status,
              expires_at: request.expires_at,
              pending_response_count: request.pending_response_count,
              created_at: request.created_at,
              updated_at: request.updated_at,
              completed_at: request.completed_at,
              cancelled_at: request.cancelled_at,
            })}
            amount={activityAmountLabel(
              request.offered_amount,
              request.currency,
              request.agreed_provider_amount,
            )}
            badge={myRequestActivityBadge({
              status: request.status,
              expires_at: request.expires_at,
              pending_response_count: request.pending_response_count,
            })}
            to={requestNavigationPath({
              role: 'requester',
              requestId: request.request_id,
              requestStatus: request.status,
            })}
          />
        ))}
      </div>
    ) : activeTab === 'responses' ? (
      <div className="flex flex-col gap-3">
        {activeProjectAssignments.length > 0 ? (
          <div className="mb-2 flex flex-col gap-2">
            <p className="text-sm font-semibold text-ink">Project work</p>
            {activeProjectAssignments.map((row) => (
              <Link
                key={row.assignment_id}
                href={`/project/${row.project_id}`}
                className="rounded-2xl border border-hairline bg-elevated p-4 active:opacity-90"
              >
                <p className="text-base font-semibold text-ink">{row.project_title}</p>
                <p className="mt-1 text-sm capitalize text-muted">
                  {row.status.replaceAll('_', ' ')} ·{' '}
                  {formatMoney(row.compensation_total_kobo / 100, MARKET.currency)}
                </p>
              </Link>
            ))}
          </div>
        ) : null}
        {responsePage.visibleItems.map((response) => (
          <ActivityMyResponseCard
            key={response.response_id}
            title={response.title ?? 'Request'}
            metaLine={myResponseActivityMetaLine({
              requester_display_name: response.requester_display_name,
              created_at: response.created_at,
            })}
            offerLine={myResponseActivityOfferLine(
              response.offered_amount,
              response.currency,
              response.quoted_amount,
            )}
            badge={myResponseActivityBadge({
              response_status: response.response_status,
              request_status: response.request_status,
            })}
            to={requestNavigationPath({
              role: 'helper',
              requestId: response.request_id,
              requestStatus: response.request_status,
              responseStatus: response.response_status,
            })}
          />
        ))}
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        {projectPage.visibleItems.map((row) => (
          <Link
            key={row.project_id}
            href={`/project/${row.project_id}`}
            className="rounded-2xl border border-hairline bg-elevated p-4 active:opacity-90"
          >
            <p className="text-base font-semibold text-ink">{row.title}</p>
            <p className="mt-1 text-sm capitalize text-muted">
              {row.status.replaceAll('_', ' ')} · {row.funding_status.replaceAll('_', ' ')}
            </p>
            <p className="mt-1 text-sm text-muted">
              {formatMoney(row.contributed_total_kobo / 100, MARKET.currency)} of{' '}
              {formatMoney(row.budget_total_kobo / 100, MARKET.currency)}
            </p>
          </Link>
        ))}
      </div>
    );

  return (
    <div
      key={activeTab}
      className="h-full overflow-y-auto px-5"
      style={{ paddingBottom: scrollPadding }}
      onScroll={onScroll}
    >
      <div className="flex flex-col gap-3">
        {listHeader}
        {listFilter}
        {itemCount === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center">{emptyContent}</div>
        ) : (
          listBody
        )}
        {hasMore ? <p className="py-3 text-center text-sm text-muted">Loading more…</p> : null}
      </div>
    </div>
  );
}