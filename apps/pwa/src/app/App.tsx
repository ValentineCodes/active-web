import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';

import { MobileGate } from '@/app/MobileGate';
import { router } from '@/app/router';
import { PwaUpdatePrompt } from '@/components/pwa/PwaUpdatePrompt';
import { ToastHost } from '@/components/ToastHost';
import { SessionProvider } from '@/features/auth/session';
import { queryClient } from '@/lib/query/client';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <MobileGate>
          <RouterProvider router={router} />
          <PwaUpdatePrompt />
          <ToastHost />
        </MobileGate>
      </SessionProvider>
    </QueryClientProvider>
  );
}
