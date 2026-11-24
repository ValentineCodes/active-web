'use client';

import { QueryClientProvider } from '@tanstack/react-query';

import { MobileGate } from '@/shell/MobileGate';
import { InstallCoachPrompt } from '@/components/pwa/InstallCoachPrompt';
import { PwaUpdatePrompt } from '@/components/pwa/PwaUpdatePrompt';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { ContextualAuthProvider } from '@/features/auth/ContextualAuthProvider';
import { SessionProvider } from '@/features/auth/session';
import { queryClient } from '@/lib/query/client';
import { PhoneFrame } from '@/components/layout/PhoneFrame';
import { ThemeProvider } from '@/theme/ThemeProvider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ContextualAuthProvider>
            <ToastProvider>
              <MobileGate>
                <PhoneFrame>{children}</PhoneFrame>
                <PwaUpdatePrompt />
              </MobileGate>
              <InstallCoachPrompt />
            </ToastProvider>
          </ContextualAuthProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
