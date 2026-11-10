import { GuestOnlyLayout } from '@/features/auth/route-guards';

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return <GuestOnlyLayout>{children}</GuestOnlyLayout>;
}
