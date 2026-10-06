import type { Database } from '@/lib/supabase/database.types';

export type ConversationMessageType = Database['public']['Enums']['conversation_message_type'];

/** Known system timeline events stored in `request_messages.metadata`. */
export type ConversationSystemEvent = 'voice_call' | 'request_lifecycle';

export type VoiceCallSystemMetadata = {
  event: 'voice_call';
  callId: string;
  status: 'started' | 'ended' | 'missed' | 'declined';
  durationSeconds?: number;
};

export type ConversationMessageMetadata = VoiceCallSystemMetadata | Record<string, unknown>;

export type RequestMessage = {
  id: string;
  senderId: string;
  messageType: ConversationMessageType;
  body: string;
  metadata: ConversationMessageMetadata | null;
  createdAt: string;
  readAt: string | null;
};

export function isTextMessage(message: RequestMessage): boolean {
  return message.messageType === 'text';
}

export function isSystemMessage(message: RequestMessage): boolean {
  return message.messageType === 'system';
}
