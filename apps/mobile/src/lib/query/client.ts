import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';

import { isNetworkError } from '@/lib/supabase/errors';

// React Query's defaults read `window` for connectivity and focus, neither of which
// exists here, so both are wired to the React Native equivalents.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    // Android reports `null` while it is still deciding; treat that as offline for refetch pausing.
    setOnline(state.isConnected !== false);
  }),
);

focusManager.setEventListener((setFocused) => {
  const subscription = AppState.addEventListener('change', (status) =>
    setFocused(status === 'active'),
  );
  return () => subscription.remove();
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Screens are revisited constantly while a request is live; a short window keeps
      // navigation instant without showing stale state.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnReconnect: true,
      // A rejected business rule ("this request is no longer available to you") is a
      // final answer. Only a dropped connection is worth retrying.
      retry: (failureCount, error) => isNetworkError(error) && failureCount < 3,
    },
    mutations: {
      retry: false,
    },
  },
});
