import { useCallback, useState } from 'react';

/** Spinner only while the user-initiated pull-to-refresh handler is running. */
export function usePullToRefresh(refresh: () => void | Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.resolve(refresh()).finally(() => {
      setRefreshing(false);
    });
  }, [refresh]);

  return { refreshing, onRefresh };
}
