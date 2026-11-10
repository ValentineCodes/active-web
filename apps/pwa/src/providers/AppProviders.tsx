'use client';

import { QueryClientProvider } from '@tanstack/react-query';

import { MobileGate } from '@/shell/MobileGate';
import { PwaUpdatePrompt } from '@/components/pwa/PwaUpdatePrompt';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { SessionProvider } from '@/features/auth/session';
import { queryClient } from '@/lib/query/client';
import { PhoneFrame } from '@/components/layout/PhoneFrame';
import { ThemeProvider } from '@/theme/ThemeProvider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ToastProvider>
            <MobileGate>
              <PhoneFrame>{children}</PhoneFrame>
              <PwaUpdatePrompt />
            </MobileGate>
          </ToastProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
