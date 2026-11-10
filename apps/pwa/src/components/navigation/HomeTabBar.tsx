'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useConversationInboxUnreadCount } from '@/features/requests/conversation-inbox-api';
import { useNotificationUnreadCount } from '@/features/notifications/inbox';
import { useMyRequests } from '@/features/requests/requester-api';
import { useColors } from '@/theme/ThemeProvider';

function tabIconColor(isActive: boolean, active: string, subtle: string) {
  return isActive ? active : subtle;
}

function TabIcon({
  href,
  label,
  icon,
  badge,
  end,
  activeColor,
  subtleColor,
}: {
  href: string;
  label: string;
  icon: string;
  badge?: string | number;
  end?: boolean;
  activeColor: string;
  subtleColor: string;
}) {
  const pathname = usePathname();
  const isActive = end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className="relative flex min-h-11 flex-1 flex-col items-center justify-center py-1"
    >
      <IonIcon icon={icon} size={24} color={tabIconColor(isActive, activeColor, subtleColor)} />
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
  const pathname = usePathname();
  const colors = useColors();
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

  const createActive = pathname === '/request/new' || pathname.startsWith('/request/new/');

  return (
    <nav
      className="relative z-10 border-t border-hairline bg-canvas px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-raised"
      aria-label="Main"
    >
      <div className="flex flex-row items-center">
        <TabIcon
          href="/home"
          end
          label="Home"
          icon={ionIcons['home-outline']}
          activeColor={colors.active}
          subtleColor={colors.subtle}
        />
        <TabIcon
          href="/activity"
          label="Activity"
          icon={ionIcons['list-outline']}
          badge={waitingResponses > 0 ? waitingResponses : undefined}
          activeColor={colors.active}
          subtleColor={colors.subtle}
        />
        <button
          type="button"
          aria-label="Create request"
          onClick={() => router.push('/request/new')}
          className="relative flex min-h-11 flex-1 flex-col items-center justify-center py-1 active:opacity-70"
        >
          <IonIcon
            icon={ionIcons['add-circle-outline']}
            size={24}
            color={tabIconColor(createActive, colors.active, colors.subtle)}
          />
        </button>
        <TabIcon
          href="/notifications"
          label="Notifications"
          icon={ionIcons['notifications-outline']}
          badge={unread.data && unread.data > 0 ? unread.data : undefined}
          activeColor={colors.active}
          subtleColor={colors.subtle}
        />
      </div>
    </nav>
  );
}
