import { RequireSignedInLayout } from '@/features/auth/route-guards';

export default function SignedInLayout({ children }: { children: React.ReactNode }) {
  return <RequireSignedInLayout>{children}</RequireSignedInLayout>;
}
