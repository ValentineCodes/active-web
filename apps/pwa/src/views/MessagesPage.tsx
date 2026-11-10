import Link from 'next/link';

import { FlowScreen } from '@/components/layout/FlowScreen';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/StateView';
import { useConversationInbox } from '@/features/requests/conversation-inbox-api';
import { formatAgo } from '@/lib/format';

function InboxRow({
  conversationId,
  title,
  preview,
  at,
  unread,
  avatarPath,
  name,
}: {
  conversationId: string;
  title: string;
  preview: string | null;
  at: string | null;
  unread: number;
  avatarPath: string | null;
  name: string | null;
}) {
  return (
    <Link
      href={`/conversation/${conversationId}`}
      className="shadow-card flex items-center gap-3 rounded-2xl border border-hairline bg-elevated p-4 active:opacity-90"
    >
      <Avatar path={avatarPath} name={name} size="md" />
      <p className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{title}</span>
        <span className="block truncate text-xs text-subtle">{preview ?? 'No messages yet'}</span>
      </p>
      <span className="flex flex-col items-end gap-1">
        {at ? <span className="text-[10px] text-subtle">{formatAgo(at)}</span> : null}
        {unread > 0 ? (
          <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-white">{unread}</span>
        ) : null}
      </span>
    </Link>
  );
}

export function MessagesPage() {
  const inbox = useConversationInbox();

  return (
    <FlowScreen title="Messages" backTo="/home" bodyClassName="flex flex-col gap-3">
      {inbox.isLoading ? <LoadingState label="Loading messages…" /> : null}
      {inbox.isError ? <InlineError error={inbox.error} /> : null}

      {!inbox.isLoading && inbox.data?.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="No conversations"
          message="Chats appear after you connect on a request."
        />
      ) : null}

      <ul className="flex flex-col gap-3">
        {inbox.data?.map((row) => (
          <li key={row.conversationId}>
            <InboxRow
              conversationId={row.conversationId}
              title={row.requestTitle}
              preview={row.latestMessageBody}
              at={row.latestMessageAt}
              unread={row.unreadCount}
              avatarPath={row.counterpartyAvatarPath}
              name={row.counterpartyDisplayName}
            />
          </li>
        ))}
      </ul>
    </FlowScreen>
  );
}
