import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query } from '@tanstack/react-query';

/**
 * Query roots persisted across app restarts. Home/discovery feeds stay network-fresh only.
 * @see EXCLUDED_QUERY_ROOTS
 */
const PERSISTED_QUERY_ROOTS = new Set([
  'profile',
  'wallet',
  'wallet-activity',
  'attendance',
  'my-requests',
  'my-responses',
  'notification-inbox',
  'notification-unread-count',
  'notification-tag-interests',
  'conversation-inbox',
  'conversation-inbox-unread-count',
  'catalogue',
  'avatar-url',
  'request-tags-catalogue',
  'engagement',
  'request-responses',
  'request-conversation',
  'resolved-request-conversation',
]);

/** Nearby browse, search, and live message bodies are intentionally not persisted. */
const EXCLUDED_QUERY_ROOTS = new Set([
  'browse-nearby',
  'request-search',
  'request-search-suggestions',
  'browse-request',
  'request-messages',
  'request-attachment-url',
  'conversation-attachment-url',
  'catalogue-media-url',
  'request-tags-search',
  'responder-pre-handshake-conversation',
]);

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'active-query-cache-v1',
  throttleTime: 1000,
});

export function shouldPersistQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  if (typeof root !== 'string') return false;
  if (EXCLUDED_QUERY_ROOTS.has(root)) return false;
  return PERSISTED_QUERY_ROOTS.has(root);
}

export async function clearPersistedQueryCache(): Promise<void> {
  await queryPersister.removeClient();
}

export const queryPersistOptions = {
  persister: queryPersister,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) => {
      if (query.state.status !== 'success') return false;
      return shouldPersistQueryKey(query.queryKey);
    },
  },
};
