'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';

import { MAIN_NAV } from '@/lib/admin/navigation';
import type { AdminPermissions } from '@/lib/admin/types';
import { cn } from '@/lib/cn';

type Props = {
  permissions: AdminPermissions;
  mobileOpen: boolean;
  onMobileClose: () => void;
};

export function AdminSidebar({ permissions, mobileOpen, onMobileClose }: Props) {
  const pathname = usePathname();

  const items = MAIN_NAV.filter((item) => permissions[item.permission]);

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-ink/50 transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onMobileClose}
        aria-hidden
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar text-white transition-transform lg:static lg:z-auto lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-teal-300">
              Active
            </p>
            <p className="text-sm font-medium text-slate-200">Operations</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-300 hover:bg-sidebar-hover lg:hidden"
            onClick={onMobileClose}
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-sidebar-hover text-white'
                    : 'text-slate-300 hover:bg-sidebar-hover hover:text-white',
                )}
              >
                <Icon className="size-4 shrink-0 opacity-90" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {!item.implemented ? (
                  <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                    Soon
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4 text-xs text-slate-400">
          Marketplace operations · Nigeria (NGN)
        </div>
      </aside>
    </>
  );
}
