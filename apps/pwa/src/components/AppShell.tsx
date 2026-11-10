import { Outlet } from 'react-router-dom';

import { HomeTabBar } from '@/components/navigation/HomeTabBar';

export function AppShell() {
  return (
    <div className="flex min-h-[100dvh] flex-1 flex-col overflow-hidden">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
      <HomeTabBar />
    </div>
  );
}
