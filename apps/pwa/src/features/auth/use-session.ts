'use client';

import { useContext } from 'react';

import { SessionContext } from '@/features/auth/session-context';

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession was called outside SessionProvider');
  return value;
}
