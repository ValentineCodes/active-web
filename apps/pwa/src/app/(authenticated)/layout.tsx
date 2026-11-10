import { RequireAuthLayout } from '@/features/auth/route-guards';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuthLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">{children}</div>
    </RequireAuthLayout>
  );
}
