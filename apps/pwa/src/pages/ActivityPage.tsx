import { type ReactNode, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ActivityMyRequestCard, ActivityMyResponseCard } from '@/components/activity/ActivityTabCards';
import { ActivityStatusFilter } from '@/components/activity/ActivityStatusFilter';
import { Screen } from '@/components/ui/Screen';
import { TAB_BAR_HEIGHT } from '@/components/ui/tab-bar-insets';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
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
  myRequestActivityDetailLine,
  myResponseActivityBadge,
  myResponseActivityMetaLine,
  myResponseActivityOfferLine,
  requestNavigationPath,
} from '@/features/requests/activity-list';
import { useMyRequests } from '@/features/requests/requester-api';
import { useMyResponses } from '@/features/requests/responses-api';
import { cn } from '@/lib/cn';

type SubTab = 'requests' | 'responses';

export function ActivityPage() {
  const [subTab, setSubTab] = useState<SubTab>('requests');
  const requests = useMyRequests();
  const responses = useMyResponses();

  const loading = requests.isLoading || responses.isLoading;
  const error = requests.isError ? requests.error : responses.isError ? responses.error : null;

  return (
    <Screen>
      <div className="min-h-0 flex flex-1 flex-col">
        <div className="px-5 pb-1 pt-3">
          <h1 className="text-3xl font-bold text-ink">Activity</h1>
        </div>

        <div className="flex flex-row border-b border-hairline px-5">
          {(['requests', 'responses'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubTab(key)}
              className={cn(
                'flex-1 border-b-2 py-3 text-sm font-semibold',
                subTab === key ? 'border-active text-ink' : 'border-transparent text-muted',
              )}
            >
              {key === 'requests' ? 'My Requests' : 'My Responses'}
            </button>
          ))}
        </div>

        {loading ? <LoadingState label="Loading activity" /> : null}
        {error ? (
          <div className="px-5 pt-4">
            <InlineError error={error} onRetry={() => void (subTab === 'requests' ? requests.refetch() : responses.refetch())} />
          </div>
        ) : null}

        {!loading && !error ? (
          subTab === 'requests' ? (
            <RequestsTab rows={requests.data ?? []} />
          ) : (
            <ResponsesTab rows={responses.data ?? []} />
          )
        ) : null}
      </div>
    </Screen>
  );
}

function RequestsTab({ rows }: { rows: NonNullable<ReturnType<typeof useMyRequests>['data']> }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<MyRequestActivityFilter>('all');
  const filtered = useMemo(
    () => rows.filter((request) => myRequestMatchesActivityFilter(request, filter)),
    [filter, rows],
  );
  const listEmpty = rows.length === 0 || filtered.length === 0;
  const paddingBottom = TAB_BAR_HEIGHT + 24;

  return emptyInner({
    paddingBottom,
    listEmpty,
    rows,
    filtered,
    filter,
    setFilter,
    navigate,
  });
}

function emptyInner(props: {
  paddingBottom: number;
  listEmpty: boolean;
  rows: NonNullable<ReturnType<typeof useMyRequests>['data']>;
  filtered: NonNullable<ReturnType<typeof useMyRequests>['data']>;
  filter: MyRequestActivityFilter;
  setFilter: (v: MyRequestActivityFilter) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { paddingBottom, listEmpty, rows, filtered, filter, setFilter, navigate } = props;
  return (
    <>
      <ActivityStatusFilter
        value={filter}
        options={MY_REQUEST_ACTIVITY_FILTER_OPTIONS}
        onChange={setFilter}
      />
      <ActivityScroll paddingBottom={paddingBottom} listEmpty={listEmpty}>
        {rows.length === 0 ? (
          <EmptyState
            layout="list"
            icon="add-circle-outline"
            title="No requests yet"
            message="When you need help, post a request and people nearby can respond."
            action={{ label: 'Ask for help', onPress: () => navigate('/request/new') }}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            layout="list"
            icon="filter-outline"
            title="No matches"
            message="Nothing in this status right now. Try another filter."
          />
        ) : (
          <RequestRows filtered={filtered} navigate={navigate} />
        )}
      </ActivityScroll>
    </>
  );
}

function RequestRows({
  filtered,
}: {
  filtered: NonNullable<ReturnType<typeof useMyRequests>['data']>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {filtered.map((request) => (
        <ActivityMyRequestCard
          key={request.request_id}
          title={request.title ?? 'Request'}
          responseLine={myRequestActivityDetailLine({
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
  );
}

function ResponsesTab({ rows }: { rows: NonNullable<ReturnType<typeof useMyResponses>['data']> }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<MyResponseActivityFilter>('all');
  const filtered = useMemo(
    () => rows.filter((response) => myResponseMatchesActivityFilter(response, filter)),
    [filter, rows],
  );
  const listEmpty = rows.length === 0 || filtered.length === 0;
  const paddingBottom = TAB_BAR_HEIGHT + 24;

  return (
    <>
      <ActivityStatusFilter
        value={filter}
        options={MY_RESPONSE_ACTIVITY_FILTER_OPTIONS}
        onChange={setFilter}
      />
      <ActivityScroll paddingBottom={paddingBottom} listEmpty={listEmpty}>
        {rows.length === 0 ? (
          <EmptyState
            layout="list"
            icon="compass-outline"
            title="No responses yet"
            message="Browse nearby on Home and respond when something fits."
            action={{ label: 'Browse nearby', onPress: () => navigate('/home') }}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            layout="list"
            icon="filter-outline"
            title="No matches"
            message="Nothing in this status right now. Try another filter."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((response) => (
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
        )}
      </ActivityScroll>
    </>
  );
}

function ActivityScroll({
  paddingBottom,
  listEmpty,
  children,
}: {
  paddingBottom: number;
  listEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="flex-1 overflow-y-auto px-5 pt-1"
      style={{
        paddingBottom,
        ...(listEmpty ? { display: 'flex', flexGrow: 1, flexDirection: 'column', justifyContent: 'center' } : {}),
      }}
    >
      {children}
    </div>
  );
}
