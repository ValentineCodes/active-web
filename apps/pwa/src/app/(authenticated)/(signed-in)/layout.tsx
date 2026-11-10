import { RequireSignedInLayout } from '@/features/auth/route-guards';

export default function SignedInLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSignedInLayout>
      <div className="flex h-full min-h-0 flex-1 flex-col">{children}</div>
    </RequireSignedInLayout>
  );
}
