import type { ReactNode } from 'react';

import { usePoppinsFonts } from '@/theme/fonts';

type Props = {
  children: ReactNode;
  fallback: ReactNode;
};

export function AppFontsProvider({ children, fallback }: Props) {
  const { loaded, error } = usePoppinsFonts();

  if (error) {
    throw error;
  }

  if (!loaded) {
    return fallback;
  }

  return children;
}
