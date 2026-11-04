import { type NextRequest, NextResponse } from 'next/server';

import { navItemForPath } from '@/lib/admin/navigation';
import { parseAdminPermissions } from '@/lib/admin/types';
import { createSupabaseMiddlewareClient } from '@/lib/supabase/middleware';

const PUBLIC_PATHS = new Set(['/login', '/access-denied']);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api/auth')
  ) {
    return NextResponse.next();
  }

  const { supabase, response } = createSupabaseMiddlewareClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.has(pathname);

  if (!user) {
    if (isPublic) return response;
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/login') {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = '/overview';
    nextUrl.search = '';
    return NextResponse.redirect(nextUrl);
  }

  const { data: permissionsRaw, error } = await supabase.rpc('get_my_admin_permissions');
  if (error) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('error', 'session');
    return NextResponse.redirect(loginUrl);
  }

  const permissions = parseAdminPermissions(permissionsRaw);

  if (!permissions) {
    if (pathname === '/access-denied') return response;
    const deniedUrl = request.nextUrl.clone();
    deniedUrl.pathname = '/access-denied';
    return NextResponse.redirect(deniedUrl);
  }

  if (pathname === '/access-denied') {
    return response;
  }

  const routePermission = pathname.startsWith('/api/admin/settings')
    ? 'settings'
    : pathname.startsWith('/api/admin/operational-issues')
      ? 'operational_issues'
      : pathname.startsWith('/api/admin/reports')
        ? 'reports'
        : pathname.startsWith('/api/admin/users')
          ? 'users'
          : pathname.startsWith('/users')
            ? 'users'
            : pathname.startsWith('/requests')
              ? 'requests'
              : pathname.startsWith('/reports')
                ? 'reports'
                : pathname.startsWith('/transactions')
                  ? 'transactions'
                  : pathname.startsWith('/wallets')
                    ? 'wallets'
                    : pathname.startsWith('/withdrawals')
                      ? 'withdrawals'
                      : pathname.startsWith('/operational-issues')
                        ? 'operational_issues'
                        : pathname.startsWith('/audit-logs')
                          ? 'audit_logs'
                          : pathname.startsWith('/settings')
                            ? 'settings'
                            : navItemForPath(pathname)?.permission;

  if (routePermission && !permissions[routePermission]) {
    const deniedUrl = request.nextUrl.clone();
    deniedUrl.pathname = '/access-denied';
    return NextResponse.redirect(deniedUrl);
  }

  if (pathname === '/') {
    const overviewUrl = request.nextUrl.clone();
    overviewUrl.pathname = '/overview';
    return NextResponse.redirect(overviewUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
