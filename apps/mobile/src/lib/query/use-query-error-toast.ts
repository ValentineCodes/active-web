import { useEffect, useRef } from 'react';

import { toUserMessage } from '@/lib/supabase/errors';
import { showAppToast } from '@/lib/toast';

type QueryErrorToastSource = {
  isError: boolean;
  isFetching: boolean;
  error: unknown;
};

/**
 * Shows one toast when a query settles in an error state. Safe across re-renders;
 * fires again when the error identity changes (e.g. after a failed refetch).
 */
export function useQueryErrorToast(
  query: QueryErrorToastSource,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const lastNotified = useRef<unknown>(undefined);

  useEffect(() => {
    if (!enabled) return;
    if (!query.isError || query.isFetching || query.error === undefined) return;
    const errorKey = toUserMessage(query.error);
    if (lastNotified.current === errorKey) return;
    lastNotified.current = errorKey;
    showAppToast(errorKey, 'warning');
  }, [enabled, query.error, query.isError, query.isFetching]);
}
