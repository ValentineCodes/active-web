/** Routes rendered inside `AppShell` / `HomeTabBar` — keep in sync with `app/routes.tsx` `TabsShell`. */
export function routeShowsHomeTabBar(pathname: string): boolean {
  if (pathname === '/home') return true;
  if (pathname === '/search' || pathname.startsWith('/search/')) return true;
  if (pathname === '/notifications' || pathname.startsWith('/notifications/')) return true;
  return false;
}