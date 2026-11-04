import type { AdminPermissionKey } from '@/lib/admin/types';
import {
  Activity,
  ArrowLeftRight,
  ClipboardList,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldAlert,
  Users,
  Wallet,
  WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  permission: AdminPermissionKey;
  icon: LucideIcon;
  implemented: boolean;
};

export const MAIN_NAV: NavItem[] = [
  {
    href: '/overview',
    label: 'Overview',
    permission: 'overview',
    icon: LayoutDashboard,
    implemented: true,
  },
  {
    href: '/users',
    label: 'Users',
    permission: 'users',
    icon: Users,
    implemented: true,
  },
  {
    href: '/requests',
    label: 'Requests & engagements',
    permission: 'requests',
    icon: ClipboardList,
    implemented: true,
  },
  {
    href: '/reports',
    label: 'Reports',
    permission: 'reports',
    icon: ShieldAlert,
    implemented: true,
  },
  {
    href: '/transactions',
    label: 'Transactions',
    permission: 'transactions',
    icon: ArrowLeftRight,
    implemented: true,
  },
  {
    href: '/wallets',
    label: 'Wallets',
    permission: 'wallets',
    icon: Wallet,
    implemented: true,
  },
  {
    href: '/withdrawals',
    label: 'Withdrawals',
    permission: 'withdrawals',
    icon: WalletCards,
    implemented: true,
  },
  {
    href: '/operational-issues',
    label: 'Operational issues',
    permission: 'operational_issues',
    icon: Activity,
    implemented: true,
  },
  {
    href: '/audit-logs',
    label: 'Audit logs',
    permission: 'audit_logs',
    icon: ScrollText,
    implemented: true,
  },
  {
    href: '/settings',
    label: 'Settings & access',
    permission: 'settings',
    icon: Settings,
    implemented: true,
  },
];

export function navItemForPath(pathname: string): NavItem | undefined {
  const normalized =
    pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  return MAIN_NAV.find((item) => item.href === normalized);
}

export function breadcrumbsForPath(pathname: string): { label: string; href?: string }[] {
  const item = navItemForPath(pathname);
  if (!item) return [{ label: 'Dashboard' }];
  return [{ label: 'Dashboard', href: '/overview' }, { label: item.label }];
}
