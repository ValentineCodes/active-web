'use client';

import type { ReactNode } from 'react';

import { useMobileAccess } from '@/device/use-mobile-access';
import { DesktopOnlyPage } from '@/views/DesktopOnlyPage';

export function MobileGate({ children }: { children: ReactNode }) {
  const allowed = useMobileAccess();
  if (!allowed) return <DesktopOnlyPage />;
  return children;
}
