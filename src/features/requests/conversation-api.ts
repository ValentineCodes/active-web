import { useEffect, useMemo, useRef } from 'react';
import {
  onlineManager,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { useUserId } from '@/features/auth/session';
import type { RequestMessage } from '@/features/requests/conversation-message-model';
import type { Database, Json } from '@/lib/supabase/database.types';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import { showAppToast } from '@/lib/toast';

export type { RequestMessage } from '@/features/requests/conversation-message-model';

const MESSAGE_PAGE_SIZE = 40;

export type RequestConversation = {
  conversationId: string;
  requestId: string;
  requesterId: string;
  selectedUserId: string;
  requestStatus: Database['public']['Enums']['request_status'];
  messagingEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type ConversationMessageType = Database['public']['Enums']['conversation_message_type'];

type MessageRow = {
  message_id: string;
  sender_id: string;
  message_type: ConversationMessageType;
  body: string;
  metadata: Json;
  created_at: string;
  read_at: string | null;
};

function mapMessageMetadata(metadata: Json): RequestMessage['metadata'] {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  return metadata as RequestMessage['metadata'];
}

type RealtimeMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type: ConversationMessageType;
  body: string;
  metadata: Json | null;
  created_at: string;
  read_at: string | null;
};

function mapMessage(row: MessageRow): RequestMessage {
  return {
    id: row.message_id,
    senderId: row.sender_id,
    messageType: row.message_type,
    body: row.body,
    metadata: mapMessageMetadata(row.metadata),
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

function mapRealtimeMessage(row: RealtimeMessageRow): RequestMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    messageType: row.message_type,
    body: row.body,
    metadata: mapMessageMetadata(row.metadata),
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export function isPendingMessageId(id: string): boolean {
  return id.startsWith('pending:');
}

export function createPendingMessageId(): string {
  return `pending:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sortMessagesChronologically(messages: RequestMessage[]): RequestMessage[] {
  return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function dedupeMessagesChronologically(messages: RequestMessage[]): RequestMessage[] {
  const byId = new Map<string, RequestMessage>();
  for (const message of messages) {
    const existing = byId.get(message.id);
    if (!existing) {
      byId.set(message.id, message);
      continue;
    }
    if (isPendingMessageId(existing.id) && !isPendingMessageId(message.id)) {
      byId.set(message.id, message);
    }
  }
  return sortMessagesChronologically([...byId.values()]);
}

function readMessagesCache(
  queryClient: QueryClient,
  conversationId: string,
): InfiniteData<RequestMessage[]> | undefined {
  return queryClient.getQueryData(queryKeys.requestMessages(conversationId));
}

function writeMessagesCache(
  queryClient: QueryClient,
  conversationId: string,
  data: InfiniteData<RequestMessage[]>,
) {
  queryClient.setQueryData(queryKeys.requestMessages(conversationId), data);
}

export function invalidateConversationInboxQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.conversationInbox });
  void queryClient.invalidateQueries({ queryKey: queryKeys.conversationInboxUnreadCount });
}

export function markIncomingMessagesReadInCache(
  queryClient: QueryClient,
  conversationId: string,
  viewerId: string,
  readAt = new Date().toISOString(),
) {
  const current = readMessagesCache(queryClient, conversationId);
  if (!current) return;

  const pages = current.pages.map((page) =>
    page.map((row) =>
      row.senderId !== viewerId && row.readAt === null ? { ...row, readAt } : row,
    ),
  );
  writeMessagesCache(queryClient, conversationId, { ...current, pages });
}

export function patchMessageReadAtInCache(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
  readAt: string | null,
) {
  const current = readMessagesCache(queryClient, conversationId);
  if (!current) return;

  const pages = current.pages.map((page) =>
    page.map((row) => (row.id === messageId ? { ...row, readAt } : row)),
  );
  writeMessagesCache(queryClient, conversationId, { ...current, pages });
}

/** Server read state + local cache + inbox/tab badge refresh (RLS via RPC). */
export async function persistConversationRead(
  queryClient: QueryClient,
  conversationId: string,
  viewerId: string,
) {
  const { error } = await supabase.rpc('mark_request_conversation_read', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;

  markIncomingMessagesReadInCache(queryClient, conversationId, viewerId);
  invalidateConversationInboxQueries(queryClient);
  void queryClient.invalidateQueries({ queryKey: queryKeys.notificationInbox });
  void queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnreadCount });
}

const CONVERSATION_FOCUS_HEARTBEAT_MS = 45_000;

async function clearRequestConversationFocus() {
  const { error } = await supabase.rpc('set_request_conversation_focus', {
    p_conversation_id: null as unknown as string,
  });
  if (error) throw error;
}

async function setRequestConversationFocus(conversationId: string) {
  const { error } = await supabase.rpc('set_request_conversation_focus', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
}

export function useRequestConversationFocus(conversationId: string | undefined, active: boolean) {
  useEffect(() => {
    if (!conversationId || !active) {
      void clearRequestConversationFocus();
      return;
    }

    void setRequestConversationFocus(conversationId);
    const interval = setInterval(() => {
      void setRequestConversationFocus(conversationId);
    }, CONVERSATION_FOCUS_HEARTBEAT_MS);

    return () => {
      clearInterval(interval);
      void clearRequestConversationFocus();
    };
  }, [active, conversationId]);
}

/** Merges a server or optimistic row; drops matching pending rows when the real id arrives. */
export function upsertMessageInCache(
  queryClient: QueryClient,
  conversationId: string,
  message: RequestMessage,
) {
  const current = readMessagesCache(queryClient, conversationId);

  if (!current) {
    writeMessagesCache(queryClient, conversationId, {
      pages: [[message]],
      pageParams: [null],
    });
    return;
  }

  let found = false;
  const updatedPages = current.pages.map((page) =>
    page.map((row) => {
      if (row.id === message.id) {
        found = true;
        return message;
      }
      return row;
    }),
  );

  if (found) {
    writeMessagesCache(queryClient, conversationId, { ...current, pages: updatedPages });
    invalidateConversationInboxQueries(queryClient);
    return;
  }

  const cleanedPages = updatedPages.map((page) =>
    page.filter(
      (row) =>
        !(
          isPendingMessageId(row.id) &&
          row.senderId === message.senderId &&
          row.body === message.body
        ),
    ),
  );

  if (cleanedPages.flat().some((row) => row.id === message.id)) {
    writeMessagesCache(queryClient, conversationId, { ...current, pages: cleanedPages });
    return;
  }

  const nextPages = [...cleanedPages];
  nextPages[0] = [message, ...(nextPages[0] ?? [])];
  writeMessagesCache(queryClient, conversationId, { ...current, pages: nextPages });
  invalidateConversationInboxQueries(queryClient);
}

function removeMessageFromCache(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
) {
  const current = readMessagesCache(queryClient, conversationId);
  if (!current) return;

  const pages = current.pages.map((page) => page.filter((row) => row.id !== messageId));
  writeMessagesCache(queryClient, conversationId, { ...current, pages });
}

function replacePendingInCache(
  queryClient: QueryClient,
  conversationId: string,
  pendingId: string,
  confirmed: RequestMessage,
) {
  const current = readMessagesCache(queryClient, conversationId);
  if (current) {
    const pages = current.pages.map((page) => page.filter((row) => row.id !== pendingId));
    writeMessagesCache(queryClient, conversationId, { ...current, pages });
  }
  upsertMessageInCache(queryClient, conversationId, confirmed);
}

/** Available only after selection; empty when the caller is not a party. */
export function useRequestConversation(requestId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.requestConversation(requestId),
    enabled: Boolean(requestId) && enabled,
    queryFn: async (): Promise<RequestConversation | null> => {
      const { data, error } = await supabase.rpc('get_request_conversation', {
        p_request_id: requestId,
      });

      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;

      return {
        conversationId: row.conversation_id,
        requestId: row.request_id,
        requesterId: row.requester_id,
        selectedUserId: row.selected_user_id,
        requestStatus: row.request_status,
        messagingEnabled: row.messaging_enabled,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  });
}

async function fetchMessagePage(conversationId: string, before: string | null) {
  const { data, error } = await supabase.rpc('list_request_messages', {
    p_conversation_id: conversationId,
    p_limit: MESSAGE_PAGE_SIZE,
    p_before: before ?? undefined,
  });

  if (error) throw error;
  return (data ?? []).map(mapMessage);
}

export function useRequestMessages(conversationId: string | undefined) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.requestMessages(conversationId ?? ''),
    enabled: Boolean(conversationId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchMessagePage(conversationId!, pageParam),
    getNextPageParam: (lastPage) => {
      if (lastPage.length < MESSAGE_PAGE_SIZE) return undefined;
      const oldest = lastPage[lastPage.length - 1];
      return oldest?.createdAt ?? undefined;
    },
    placeholderData: (previousData) => previousData,
  });

  const messagesChronological = useMemo(() => {
    const rows = query.data?.pages.flat() ?? [];
    return dedupeMessagesChronologically(rows);
  }, [query.data?.pages]);

  /** Newest-first for inverted `FlatList` (latest sits above the composer). */
  const messages = useMemo(() => [...messagesChronological].reverse(), [messagesChronological]);

  return { ...query, messages, messagesChronological };
}

export function useSendRequestMessage(conversationId: string, requestId: string) {
  const queryClient = useQueryClient();
  const userId = useUserId();

  return useMutation({
    mutationFn: async ({ body }: { body: string; pendingId: string }) => {
      const trimmed = body.trim();
      if (!trimmed) {
        throw new Error('Message cannot be empty');
      }

      const { data, error } = await supabase.rpc('send_request_message', {
        p_conversation_id: conversationId,
        p_body: trimmed,
      });
      if (error) throw error;

      return { messageId: data as string, body: trimmed };
    },
    onMutate: async ({ body, pendingId }) => {
      const trimmed = body.trim();
      const optimistic: RequestMessage = {
        id: pendingId,
        senderId: userId,
        messageType: 'text',
        body: trimmed,
        metadata: null,
        createdAt: new Date().toISOString(),
        readAt: null,
      };
      upsertMessageInCache(queryClient, conversationId, optimistic);
      return { pendingId };
    },
    onSuccess: ({ messageId, body }, { pendingId }) => {
      replacePendingInCache(queryClient, conversationId, pendingId, {
        id: messageId,
        senderId: userId,
        messageType: 'text',
        body,
        metadata: null,
        createdAt: new Date().toISOString(),
        readAt: null,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.requestConversation(requestId) });
      invalidateConversationInboxQueries(queryClient);
    },
    onError: (error, { pendingId }) => {
      removeMessageFromCache(queryClient, conversationId, pendingId);
      const message =
        error instanceof Error ? error.message : 'Could not send your message. Try again.';
      showAppToast(message, 'warning');
    },
  });
}

const liveConversationChannels = new Map<string, { refCount: number; channel: RealtimeChannel }>();
const liveConversationTeardowns = new Map<string, Promise<void>>();
const liveConversationAcquires = new Map<string, Promise<void>>();

function syncConversationAfterGap(queryClient: QueryClient, conversationId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.requestMessages(conversationId) });
}

function createLiveConversationChannel(
  conversationId: string,
  requestId: string,
  queryClient: QueryClient,
  options: {
    viewerId: string;
    getSyncReadWhileViewing: () => boolean;
    getIncomingToastLabel: () => string | null;
  },
) {
  let sawSubscription = false;

  return supabase
    .channel(`conversation-messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'request_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = payload.new as RealtimeMessageRow;
        if (!row?.id || row.conversation_id !== conversationId) return;

        upsertMessageInCache(queryClient, conversationId, mapRealtimeMessage(row));
        void queryClient.invalidateQueries({ queryKey: queryKeys.requestConversation(requestId) });

        if (
          row.message_type === 'text' &&
          row.sender_id !== options.viewerId &&
          options.getSyncReadWhileViewing()
        ) {
          const label = options.getIncomingToastLabel();
          if (label) {
            showAppToast(`${label} sent you a message.`, 'info');
          }
          void persistConversationRead(queryClient, conversationId, options.viewerId);
        }
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'request_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = payload.new as RealtimeMessageRow;
        if (!row?.id || row.conversation_id !== conversationId) return;

        patchMessageReadAtInCache(queryClient, conversationId, row.id, row.read_at);
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (sawSubscription) {
          syncConversationAfterGap(queryClient, conversationId);
        }
        sawSubscription = true;
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        syncConversationAfterGap(queryClient, conversationId);
      }
    });
}

type LiveConversationOptions = {
  viewerId: string;
  getSyncReadWhileViewing: () => boolean;
  getIncomingToastLabel: () => string | null;
};

const liveConversationOptions = new Map<string, LiveConversationOptions>();

async function acquireLiveConversationChannel(
  conversationId: string,
  requestId: string,
  queryClient: QueryClient,
  options: LiveConversationOptions,
) {
  const pendingTeardown = liveConversationTeardowns.get(conversationId);
  if (pendingTeardown) {
    await pendingTeardown;
  }

  const existing = liveConversationChannels.get(conversationId);
  if (existing) {
    existing.refCount += 1;
    liveConversationOptions.set(conversationId, options);
    return;
  }

  const pendingAcquire = liveConversationAcquires.get(conversationId);
  if (pendingAcquire) {
    await pendingAcquire;
    const shared = liveConversationChannels.get(conversationId);
    if (shared) {
      shared.refCount += 1;
    }
    return;
  }

  const acquire = (async () => {
    liveConversationOptions.set(conversationId, options);
    const channel = createLiveConversationChannel(conversationId, requestId, queryClient, options);
    liveConversationChannels.set(conversationId, { refCount: 1, channel });
  })();

  liveConversationAcquires.set(conversationId, acquire);
  try {
    await acquire;
  } finally {
    liveConversationAcquires.delete(conversationId);
  }
}

async function releaseLiveConversationChannel(conversationId: string) {
  const entry = liveConversationChannels.get(conversationId);
  if (!entry) return;

  entry.refCount -= 1;
  if (entry.refCount > 0) return;

  liveConversationChannels.delete(conversationId);
  liveConversationOptions.delete(conversationId);
  const teardown = supabase.removeChannel(entry.channel).then(() => undefined);
  liveConversationTeardowns.set(conversationId, teardown);
  try {
    await teardown;
  } finally {
    if (liveConversationTeardowns.get(conversationId) === teardown) {
      liveConversationTeardowns.delete(conversationId);
    }
  }
}

/**
 * Subscribes to new rows for one conversation while the screen is mounted.
 * Patches the React Query cache on INSERT (no full-list refetch per message).
 */
export function useLiveConversationMessages(
  conversationId: string | undefined,
  requestId: string,
  syncReadWhileViewing: boolean,
  counterpartyDisplayName: string | null | undefined,
) {
  const queryClient = useQueryClient();
  const viewerId = useUserId();
  const syncReadRef = useRef(syncReadWhileViewing);
  const counterpartyRef = useRef(counterpartyDisplayName);

  useEffect(() => {
    syncReadRef.current = syncReadWhileViewing;
  }, [syncReadWhileViewing]);

  useEffect(() => {
    counterpartyRef.current = counterpartyDisplayName;
  }, [counterpartyDisplayName]);

  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;

    void acquireLiveConversationChannel(conversationId, requestId, queryClient, {
      viewerId,
      getSyncReadWhileViewing: () => syncReadRef.current,
      getIncomingToastLabel: () => {
        if (!syncReadRef.current) return null;
        const name = counterpartyRef.current?.trim();
        if (!name) return null;
        return name.split(/\s+/)[0] ?? name;
      },
    }).then(() => {
      if (cancelled) {
        void releaseLiveConversationChannel(conversationId);
      }
    });

    return () => {
      cancelled = true;
      void releaseLiveConversationChannel(conversationId);
    };
  }, [conversationId, queryClient, requestId, viewerId]);

  useEffect(() => {
    if (!conversationId) return;

    return onlineManager.subscribe((online) => {
      if (online) {
        syncConversationAfterGap(queryClient, conversationId);
      }
    });
  }, [conversationId, queryClient]);
}
