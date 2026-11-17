import { supabase } from '@/lib/supabase/client';

import {
  createCompletionProofSendSession,
  sendCompletionProofMessage,
  type CompletionProofSendSession,
  type CompletionProofStagedMedia,
} from '@/features/requests/send-completion-proof-message';

export function milestoneSubmissionChatBody(position: number, message: string): string {
  const trimmed = message.trim();
  return trimmed ? `[Milestone ${position}] ${trimmed}` : `[Milestone ${position}]`;
}

/** Optional milestone note and/or proof in the request chat (paidaid-style). */
export async function postMilestoneSubmissionToChat(input: {
  conversationId: string;
  position: number;
  message: string;
  staged: CompletionProofStagedMedia | null;
  session?: CompletionProofSendSession;
}): Promise<void> {
  const caption = milestoneSubmissionChatBody(input.position, input.message);
  const hasText = input.message.trim().length > 0;
  const hasMedia = input.staged != null;

  if (!hasText && !hasMedia) {
    return;
  }

  if (hasMedia && input.staged) {
    const session = input.session ?? createCompletionProofSendSession();
    await sendCompletionProofMessage({
      conversationId: input.conversationId,
      staged: input.staged,
      session,
      caption,
    });
    return;
  }

  const { error } = await supabase.rpc('send_request_message', {
    p_conversation_id: input.conversationId,
    p_body: caption,
  });
  if (error) throw error;
}