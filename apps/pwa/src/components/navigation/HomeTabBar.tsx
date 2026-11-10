'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useConversationInboxUnreadCount } from '@/features/requests/conversation-inbox-api';
import { useNotificationUnreadCount } from '@/features/notifications/inbox';
import { useMyRequests } from '@/features/requests/requester-api';
import { cn } from '@/lib/cn';

function TabIcon({
  href,
  label,
  icon,
  badge,
  end,
}: {
  href: string;
  label: string;
  icon: string;
  badge?: string | number;
  end?: boolean;
}) {
  const pathname = usePathname();
  const isActive = end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        'relative flex min-h-11 flex-1 flex-col items-center justify-center py-1',
        isActive ? 'text-active' : 'text-subtle',
      )}
    >
      <IonIcon icon={icon} size={24} color={isActive ? '#1FA35A' : '#8A948C'} />
      {badge != null && badge !== 0 && badge !== '' ? (
        <span className="absolute right-[calc(50%-18px)] top-0 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold text-white">
          {String(badge)}
        </span>
      ) : null}
    </Link>
  );
}

export function HomeTabBar() {
  const router = useRouter();
  const unread = useNotificationUnreadCount();
  const { data: requests } = useMyRequests();
  useConversationInboxUnreadCount();

  const waitingResponses =
    requests?.reduce(
      (total, request) =>
        request.status === 'posted' || request.status === 'searching'
          ? total + request.pending_response_count
          : total,
      0,
    ) ?? 0;

  return (
    <nav
      className="shadow-raised border-t border-hairline bg-canvas px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      aria-label="Main"
    >
      <div className="flex flex-row items-center">
        <TabIcon href="/home" end label="Home" icon={ionIcons['home-outline']} />
        <TabIcon
          href="/activity"
          label="Activity"
          icon={ionIcons['list-outline']}
          badge={waitingResponses > 0 ? waitingResponses : undefined}
        />
        <div className="flex min-h-11 flex-1 items-center justify-center py-1">
          <button
            type="button"
            aria-label="Create request"
            onClick={() => router.push('/request/new')}
            className="shadow-raised flex h-11 w-11 items-center justify-center rounded-xl bg-active active:opacity-90"
          >
            <IonIcon icon={ionIcons.add} size={28} color="#111812" />
          </button>
        </div>
        <TabIcon
          href="/notifications"
          label="Notifications"
          icon={ionIcons['notifications-outline']}
          badge={unread.data && unread.data > 0 ? unread.data : undefined}
        />
      </div>
    </nav>
  );
}
