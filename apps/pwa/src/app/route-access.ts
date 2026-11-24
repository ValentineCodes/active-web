import type { AuthRouteState } from '@/features/auth/auth-state';

/** Route access buckets for marketplace Phase 2 — kept in sync with `routes.tsx`. */

const PUBLIC_MARKETPLACE_EXACT = new Set(['/home', '/search']);
const PUBLIC_GUEST_EXACT = new Set(['/welcome', '/sign-in', '/install']);
const PUBLIC_MARKETPLACE_PREFIXES = ['/request/', '/respond/', '/project/', '/u/'] as const;

const PROTECTED_PREFIXES = [
  '/profile',
  '/notifications',
  '/notification-settings',
  '/settings',
  '/messages',
  '/request/new',
  '/project/new',
  '/engagement',
  '/wallet',
  '/onboarding',
  '/activity',
] as const;

export type RouteAccess = 'root_redirect' | 'public_guest' | 'public_marketplace' | 'protected';

export function classifyRoutePath(pathname: string): RouteAccess {
  if (pathname === '/') return 'root_redirect';
  if (PUBLIC_GUEST_EXACT.has(pathname)) return 'public_guest';
  if (PUBLIC_MARKETPLACE_EXACT.has(pathname)) return 'public_marketplace';
  if (pathname.startsWith('/project/') && pathname.includes('/assignment/')) return 'protected';
  for (const prefix of PROTECTED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return 'protected';
  }
  if (pathname.startsWith('/rate/')) return 'protected';
  for (const prefix of PUBLIC_MARKETPLACE_PREFIXES) {
    if (pathname.startsWith(prefix)) return 'public_marketplace';
  }
  return 'public_marketplace';
}

export function publicMarketplaceAllowsAuthState(state: AuthRouteState) {
  return state === 'guest' || state === 'signed_in';
}

export function protectedRouteAllowsAuthState(state: AuthRouteState) {
  return state === 'signed_in';
}
