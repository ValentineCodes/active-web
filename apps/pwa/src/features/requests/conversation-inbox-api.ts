'use client';

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { persistConversationRead } from '@/features/requests/conversation-api';
import { queryKeys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';

import type { Database } from '@/lib/supabase/database.types';

export type ConversationInboxItem = {
  conversationId: string;
  requestId: string;
  requestTitle: string;
  requestStatus: Database['public']['Enums']['request_status'];
  messagingEnabled: boolean;
  counterpartyId: string;
  counterpartyDisplayName: string | null;
  counterpartyAvatarPath: string | null;
  counterpartyAvatarCapturedInApp: boolean;
  counterpartyIdentityVerified: boolean;
  latestMessageBody: string | null;
  latestMessageAt: string | null;
  latestMessageSenderId: string | null;
  unreadCount: number;
  updatedAt: string;
};

async function fetchConversationInbox(): Promise<ConversationInboxItem[]> {
  const { data, error } = await supabase.rpc('list_my_request_conversations');
  if (error) throw error;

  type InboxRow = NonNullable<typeof data>[number];
  return (data ?? []).map((row: InboxRow) => ({
    conversationId: row.conversation_id,
    requestId: row.request_id,
    requestTitle: row.request_title,
    requestStatus: row.request_status,
    messagingEnabled: row.messaging_enabled,
    counterpartyId: row.counterparty_id,
    counterpartyDisplayName: row.counterparty_display_name,
    counterpartyAvatarPath: row.counterparty_avatar_path,
    counterpartyAvatarCapturedInApp: row.counterparty_avatar_captured_in_app,
    counterpartyIdentityVerified: row.counterparty_identity_verified,
    latestMessageBody: row.latest_message_body,
    latestMessageAt: row.latest_message_at,
    latestMessageSenderId: row.latest_message_sender_id,
    unreadCount: row.unread_count,
    updatedAt: row.updated_at,
  }));
}

export function useConversationInbox() {
  return useQuery({
    queryKey: queryKeys.conversationInbox,
    queryFn: fetchConversationInbox,
    refetchOnMount: 'always',
  });
}

export function useConversationInboxUnreadCount() {
  return useQuery({
    queryKey: queryKeys.conversationInboxUnreadCount,
    queryFn: async () => {
      const rows = await fetchConversationInbox();
      return rows.reduce((total, row) => total + row.unreadCount, 0);
    },
    refetchOnMount: 'always',
  });
}

export async function markRequestConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_request_conversation_read', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
}

/**
 * Marks incoming messages read only while the conversation thread is visible
 * (not when the Messages inbox list is shown).
 */
export function useMarkConversationReadWhenVisible(
  conversationId: string | undefined,
  viewerId: string,
  visible: boolean,
) {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);

  useEffect(() => {
    if (!conversationId || !visible) return;

    if (inFlight.current) return;
    inFlight.current = true;

    void persistConversationRead(queryClient, conversationId, viewerId).finally(() => {
      inFlight.current = false;
    });
  }, [conversationId, queryClient, viewerId, visible]);
}
