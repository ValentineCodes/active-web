import type { ReactNode } from 'react';

import { HomeTabBar } from '@/components/navigation/HomeTabBar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {children}
      </main>
      <HomeTabBar />
    </div>
  );
}
