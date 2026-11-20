'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppLink from '@/components/AppLink';
import { Screen } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { SearchResultListSkeleton } from '@/components/ui/content-skeletons';
import { EmptyState, InlineError } from '@/components/ui/StateView';
import { MARKET } from '@/config';
import { useUserId } from '@/features/auth/use-user-id';
import {
  SearchDiscoverCategory,
  useSearchDiscover,
  useSearchDiscoverInfinite,
} from '@/features/search/discovery-api';
import { buildTopDiscoverRows, flattenDiscoverPages } from '@/features/search/discovery-rows';
import type { SearchDiscoverListRow } from '@/features/search/discovery-types';
import { formatMoney, formatProximity } from '@/lib/format';
import { readPositionIfPermitted, type Position } from '@/lib/geolocation';
import { useRouter, useSearchParams } from '@/lib/navigation';
import { cn } from '@/lib/cn';
import { readAppTabBarInset } from '@/components/ui/tab-bar-insets';
import { useColors } from '@/theme/ThemeProvider';

const CATEGORIES: { id: SearchDiscoverCategory; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'requests', label: 'Requests' },
  { id: 'people', label: 'People' },
  { id: 'projects', label: 'Projects' },
];

function RequestRowBody({ row }: { row: SearchDiscoverListRow & { kind: 'request' } }) {
  const request = row.request;
  const proximity =
    request.distance_m != null ? formatProximity(request.distance_m) : request.location_label;
  const offer =
    request.offered_amount != null && request.currency
      ? formatMoney(request.offered_amount, request.currency)
      : null;

  return (
    <div className="rounded-xl bg-surface p-3">
      <p className="font-medium text-ink">{request.title}</p>
      {proximity ? <p className="mt-1 text-sm text-muted">{proximity}</p> : null}
      {offer ? <p className="mt-1 text-sm font-medium text-ink">{offer}</p> : null}
      {request.requester_display_name ? (
        <p className="mt-1 text-sm text-muted">{request.requester_display_name}</p>
      ) : null}
    </div>
  );
}

function ProjectRowBody({ row }: { row: SearchDiscoverListRow & { kind: 'project' } }) {
  const project = row.project;
  const budgetMajor =
    project.budget_total_kobo != null ? project.budget_total_kobo / 100 : null;
  const budgetLabel =
    budgetMajor != null ? formatMoney(budgetMajor, MARKET.currency) : null;

  return (
    <div className="rounded-xl bg-surface p-3">
      <p className="font-medium text-ink">{project.title}</p>
      <p className="mt-1 text-sm capitalize text-muted">
        {project.funding_status.replaceAll('_', ' ')}
      </p>
      {budgetLabel ? <p className="mt-1 text-sm font-medium text-ink">{budgetLabel}</p> : null}
      {project.description ? (
        <p className="mt-1 line-clamp-2 text-sm text-muted">{project.description}</p>
      ) : null}
    </div>
  );
}

export function SearchPage() {
  const colors = useColors();
  const router = useRouter();
  const userId = useUserId();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q')?.trim() ?? '';

  const [position, setPosition] = useState<Position | null>(null);
  const [draft, setDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<SearchDiscoverCategory>('top');

  useEffect(() => {
    const handle = window.setTimeout(() => setQuery(draft.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [draft]);

  useEffect(() => {
    void readPositionIfPermitted().then(setPosition);
  }, []);

  const commitQuery = useCallback(() => {
    setQuery(draft.trim());
  }, [draft]);

  const clearSearch = useCallback(() => {
    setDraft('');
    setQuery('');
  }, []);

  const enabled = query.length > 0;
  const discoverTop = useSearchDiscover(
    category,
    query,
    position?.latitude ?? null,
    position?.longitude ?? null,
    enabled,
  );
  const discoverPaged = useSearchDiscoverInfinite(
    category,
    query,
    position?.latitude ?? null,
    position?.longitude ?? null,
    enabled,
  );

  const rows = useMemo((): SearchDiscoverListRow[] => {
    if (category === 'top') {
      if (!discoverTop.data) return [];
      return buildTopDiscoverRows(discoverTop.data);
    }
    return flattenDiscoverPages(category, discoverPaged.data?.pages ?? []);
  }, [category, discoverPaged.data, discoverTop.data]);

  const isLoading = category === 'top' ? discoverTop.isPending : discoverPaged.isPending;
  const isError = category === 'top' ? discoverTop.isError : discoverPaged.isError;
  const error = category === 'top' ? discoverTop.error : discoverPaged.error;
  const topRankingDeferred = category === 'top' && discoverTop.data?.ranking === 'deferred_ud_11';

  const openRequest = useCallback(
    (requestId: string, requesterId: string) => {
      if (userId && requesterId === userId) {
        router.push(`/request/${requestId}`);
        return;
      }
      const params = new URLSearchParams();
      if (position) {
        params.set('lat', String(position.latitude));
        params.set('lng', String(position.longitude));
      }
      const queryString = params.size > 0 ? `?${params.toString()}` : '';
      router.push(`/respond/${requestId}${queryString}`);
    },
    [position, router, userId],
  );

  const onCategory = useCallback((id: SearchDiscoverCategory) => setCategory(id), []);

  const tabBarInset = readAppTabBarInset(8);

  return (
    <Screen className="flex h-full min-h-0 flex-1 flex-col bg-canvas">
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-2"
        style={{ paddingBottom: tabBarInset }}
      >
        <h1 className="font-display text-2xl text-ink">Search</h1>
        <div className="relative">
          <input
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitQuery();
            }}
            placeholder="Search by name or @username"
            aria-label="Search Active"
            className="w-full rounded-xl border-2 border-transparent bg-surface py-2.5 pl-4 pr-10 text-base text-ink outline-none placeholder:text-subtle focus:border-brand"
          />
          {draft.length > 0 ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
            >
              ×
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((item) => {
            const selected = item.id === category;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onCategory(item.id)}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium',
                  selected ? 'text-canvas' : 'bg-surface text-ink',
                )}
                style={selected ? { backgroundColor: colors.active, color: colors.canvas } : { color: colors.ink }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {topRankingDeferred ? (
          <p className="text-xs text-subtle">
            Top combines fixed slices per type; blended ranking is deferred (UD-11).
          </p>
        ) : null}

        {query.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="Search Active"
            message="Find requests, people, and projects by name or keyword."
          />
        ) : isLoading ? (
          <SearchResultListSkeleton />
        ) : isError ? (
          <InlineError
            error={error}
            onRetry={() => void (category === 'top' ? discoverTop.refetch() : discoverPaged.refetch())}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="person-outline"
            title="No results"
            message={
              category === 'requests' && !position
                ? 'Allow location access to search nearby requests.'
                : 'Try another query or category.'
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row) => {
              if (row.kind === 'section') {
                return (
                  <p
                    key={row.key}
                    className="mt-2 text-xs font-semibold uppercase tracking-wide text-subtle"
                  >
                    {row.title}
                  </p>
                );
              }

              if (row.kind === 'person') {
                const title = row.person.display_name ?? row.person.username;
                return (
                  <AppLink key={row.key} href={row.href} className="block active:opacity-90">
                    <div className="rounded-xl bg-surface p-3">
                      <p className="font-medium text-ink">{title}</p>
                      <p className="mt-1 text-sm text-muted">@{row.person.username}</p>
                      {row.person.bio ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted">{row.person.bio}</p>
                      ) : null}
                    </div>
                  </AppLink>
                );
              }

              if (row.kind === 'request') {
                return (
                  <button
                    key={row.key}
                    type="button"
                    className="block w-full text-left active:opacity-90"
                    onClick={() => openRequest(row.request.request_id, row.request.requester_id)}
                  >
                    <RequestRowBody row={row} />
                  </button>
                );
              }

              return (
                <AppLink key={row.key} href={row.href} className="block active:opacity-90">
                  <ProjectRowBody row={row} />
                </AppLink>
              );
            })}
            {category !== 'top' && discoverPaged.hasNextPage ? (
              <Button
                label={discoverPaged.isFetchingNextPage ? 'Loading…' : 'Load more'}
                variant="secondary"
                disabled={discoverPaged.isFetchingNextPage}
                onClick={() => void discoverPaged.fetchNextPage()}
              />
            ) : null}
          </div>
        )}
      </div>
    </Screen>
  );
}