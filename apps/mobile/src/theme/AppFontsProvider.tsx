import type { ReactNode } from 'react';

import { usePoppinsFonts } from '@/theme/fonts';

type Props = {
  children: ReactNode;
};

export function AppFontsProvider({ children }: Props) {
  const { loaded, error } = usePoppinsFonts();

  if (error) {
    throw error;
  }

  if (!loaded) {
    return null;
  }

  return children;
}
