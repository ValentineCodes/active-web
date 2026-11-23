'use client';

import type { ReactNode, RefObject } from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import Link from '@/components/AppLink';
import { usePathname, useRouter } from '@/lib/navigation';

import { useContextualAuth } from '@/features/auth/ContextualAuthProvider';
import { useHasSession } from '@/features/auth/use-user-id';

import { useCreateComposer } from '@/components/create/CreateComposerProvider';
import { IonIcon } from '@/components/ui/IonIcon';
import { ionIcons } from '@/components/ui/ion-icons';
import { useConversationInboxUnreadCount } from '@/features/requests/conversation-inbox-api';
import { useNotificationUnreadCount } from '@/features/notifications/inbox';
import { useColors } from '@/theme/ThemeProvider';

const TAB_COUNT = 4;

function TabBarSlot({ children }: { children: ReactNode }) {
  return <span className="tab-bar-slot">{children}</span>;
}

function assignTabSlotRef(refs: RefObject<(HTMLElement | null)[]>, index: number) {
  return (element: HTMLElement | null) => {
    refs.current[index] = element;
  };
}

function TabIcon({
  href,
  label,
  iconOutline,
  iconSelected,
  badge,
  end,
  isActive,
  slotRef,
  activeColor,
  inactiveColor,
}: {
  href: string;
  label: string;
  iconOutline: string;
  iconSelected: string;
  badge?: string | number;
  end?: boolean;
  isActive: boolean;
  slotRef: (element: HTMLElement | null) => void;
  activeColor: string;
  inactiveColor: string;
}) {
  return (
    <Link
      ref={slotRef}
      href={href}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className="relative z-[1] flex min-h-11 flex-1 flex-col items-center justify-center py-0.5 active:opacity-90"
    >
      <TabBarSlot>
        <IonIcon
          icon={isActive ? iconSelected : iconOutline}
          size={24}
          color={isActive ? activeColor : inactiveColor}
        />
      </TabBarSlot>
      {badge != null && badge !== 0 && badge !== '' ? (
        <span className="absolute right-[calc(50%-1.35rem)] top-0 z-[2] min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold text-white">
          {String(badge)}
        </span>
      ) : null}
    </Link>
  );
}

function resolveActiveTabIndex(pathname: string, createActive: boolean): number {
  if (createActive) return 2;
  if (pathname === '/home') return 0;
  if (pathname === '/search' || pathname.startsWith('/search/')) return 1;
  if (pathname === '/notifications' || pathname.startsWith('/notifications/')) return 3;
  return 0;
}

function isTabActive(pathname: string, href: string, end?: boolean): boolean {
  if (end) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function HomeTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const hasSession = useHasSession();
  const contextualAuth = useContextualAuth();
  const colors = useColors();
  const unread = useNotificationUnreadCount();
  const { isOpen, openCreateComposer } = useCreateComposer();
  useConversationInboxUnreadCount();

  const rowRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLElement | null)[]>(Array.from({ length: TAB_COUNT }, () => null));

  const notificationBadge =
    hasSession && unread.data && unread.data > 0 ? unread.data : undefined;

  const onCreateTabPress = () => {
    if (hasSession) openCreateComposer();
    else contextualAuth.requestAuth({ type: 'create' });
  };

  const onNotificationsTabPress = () => {
    if (hasSession) router.push('/notifications');
    else contextualAuth.requestAuth({ type: 'notifications' });
  };

  const createActive =
    isOpen ||
    pathname === '/request/new' ||
    pathname.startsWith('/request/new/') ||
    pathname === '/project/new' ||
    pathname.startsWith('/project/new/');

  const activeIndex = useMemo(
    () => resolveActiveTabIndex(pathname, createActive),
    [pathname, createActive],
  );

  const inactiveColor = colors.ink;
  const activeColor = colors.active;

  const [pill, setPill] = useState({ x: 0, width: 0, ready: false });

  const measureSelectionPill = useCallback(() => {
    const row = rowRef.current;
    const slot = slotRefs.current[activeIndex];
    if (!row || !slot) return;

    const rowRect = row.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();
    setPill({
      x: slotRect.left - rowRect.left,
      width: slotRect.width,
      ready: true,
    });
  }, [activeIndex]);

  useLayoutEffect(() => {
    measureSelectionPill();
  }, [measureSelectionPill]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      measureSelectionPill();
    });

    observer.observe(row);
    for (const slot of slotRefs.current) {
      if (slot) observer.observe(slot);
    }

    return () => observer.disconnect();
  }, [measureSelectionPill, activeIndex]);

  const homeActive = isTabActive(pathname, '/home', true);
  const searchActive = isTabActive(pathname, '/search');
  const notificationsActive = isTabActive(pathname, '/notifications');

  return (
    <nav
      className="pointer-events-none absolute inset-x-0 bottom-0 z-50 px-3 pb-[max(var(--tab-bar-float-gap),env(safe-area-inset-bottom))]"
      aria-label="Main"
    >
      <div className="tab-bar-glass pointer-events-auto min-h-[var(--tab-bar-pill-height)] px-1.5 py-1">
        <div ref={rowRef} className="relative flex flex-row items-center">
          <div
            className="tab-bar-selection-pill"
            aria-hidden
            style={{
              width: pill.ready ? pill.width : 0,
              transform: `translateX(${pill.x}px)`,
              opacity: pill.ready ? 1 : 0,
            }}
          />

          <TabIcon
            href="/home"
            end
            label="Home"
            isActive={homeActive}
            slotRef={assignTabSlotRef(slotRefs, 0)}
            iconOutline={ionIcons['home-outline']}
            iconSelected={ionIcons.home}
            activeColor={activeColor}
            inactiveColor={inactiveColor}
          />
          <TabIcon
            href="/search"
            label="Search"
            isActive={searchActive}
            slotRef={assignTabSlotRef(slotRefs, 1)}
            iconOutline={ionIcons['search-outline']}
            iconSelected={ionIcons.search}
            activeColor={activeColor}
            inactiveColor={inactiveColor}
          />
          <button
            ref={assignTabSlotRef(slotRefs, 2)}
            type="button"
            aria-label="Create request"
            aria-pressed={createActive}
            onClick={onCreateTabPress}
            className="relative z-[1] flex min-h-11 flex-1 flex-col items-center justify-center py-0.5 active:opacity-90"
          >
            <TabBarSlot>
              <IonIcon
                icon={ionIcons.add}
                size={28}
                color={createActive ? activeColor : inactiveColor}
              />
            </TabBarSlot>
          </button>
          {hasSession ? (
            <TabIcon
              href="/notifications"
              label="Notifications"
              isActive={notificationsActive}
              slotRef={assignTabSlotRef(slotRefs, 3)}
              iconOutline={ionIcons['notifications-outline']}
              iconSelected={ionIcons.notifications}
              badge={notificationBadge}
              activeColor={activeColor}
              inactiveColor={inactiveColor}
            />
          ) : (
            <button
              ref={assignTabSlotRef(slotRefs, 3)}
              type="button"
              aria-label="Notifications"
              onClick={onNotificationsTabPress}
              className="relative z-[1] flex min-h-11 flex-1 flex-col items-center justify-center py-0.5 active:opacity-90"
            >
              <TabBarSlot>
                <IonIcon
                  icon={notificationsActive ? ionIcons.notifications : ionIcons['notifications-outline']}
                  size={24}
                  color={notificationsActive ? activeColor : inactiveColor}
                />
              </TabBarSlot>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}