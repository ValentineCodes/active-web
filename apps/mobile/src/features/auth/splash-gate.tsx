import { useEffect, type ReactNode } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useIsRestoring } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session';
import { usePoppinsFonts } from '@/theme/fonts';

SplashScreen.preventAutoHideAsync().catch(() => {});

type Props = {
  children: ReactNode;
};

/** Native splash stays up until fonts, auth storage, and persisted query cache are ready. */
export function AppReadyGate({ children }: Props) {
  const { isAuthHydrated } = useSession();
  const isRestoringCache = useIsRestoring();
  const { loaded, error } = usePoppinsFonts();

  const ready = loaded && isAuthHydrated && !isRestoringCache;

  useEffect(() => {
    if (error) {
      throw error;
    }
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [error, ready]);

  if (!ready) {
    return null;
  }

  return children;
}
