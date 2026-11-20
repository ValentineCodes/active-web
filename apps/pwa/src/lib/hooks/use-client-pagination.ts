import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_PAGE_SIZE = 20;

export function useClientPagination<T>(items: T[], pageSize = DEFAULT_PAGE_SIZE, resetKey?: string) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const loadingMore = useRef(false);

  useEffect(() => {
    setVisibleCount(pageSize);
    loadingMore.current = false;
  }, [pageSize, resetKey, items.length]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = visibleCount < items.length;

  const loadMore = useCallback(() => {
    if (loadingMore.current || !hasMore) return;
    loadingMore.current = true;
    setVisibleCount((current) => Math.min(current + pageSize, items.length));
    queueMicrotask(() => {
      loadingMore.current = false;
    });
  }, [hasMore, items.length, pageSize]);

  return {
    visibleItems,
    hasMore,
    loadMore,
    isLoadingMore: hasMore && visibleCount > pageSize,
  };
}