import { AppProviders } from '@/providers/AppProviders';

import { AppRoutes } from './routes';

export function App() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  );
}