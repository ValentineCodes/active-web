import { RequireAuthLayout } from '@/features/auth/route-guards';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuthLayout>{children}</RequireAuthLayout>;
}
