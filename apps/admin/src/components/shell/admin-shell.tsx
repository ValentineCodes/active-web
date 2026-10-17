'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { breadcrumbsForPath, navItemForPath } from '@/lib/admin/navigation';
import type { AdminSessionView } from '@/lib/admin/types';
import { AdminSidebar } from '@/components/shell/admin-sidebar';
import { AdminTopbar } from '@/components/shell/admin-topbar';

type Props = {
  session: AdminSessionView;
  children: React.ReactNode;
};

export function AdminShell({ session, children }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItem = navItemForPath(pathname);
  const title = navItem?.label ?? 'Dashboard';

  return (
    <div className="flex min-h-screen bg-surface">
      <AdminSidebar
        permissions={session.permissions}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-0">
        <AdminTopbar
          session={session}
          title={title}
          breadcrumbs={breadcrumbsForPath(pathname)}
          onOpenNav={() => setMobileOpen(true)}
        />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
