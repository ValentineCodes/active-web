import { RequireOnboardingLayout } from '@/features/auth/route-guards';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <RequireOnboardingLayout>{children}</RequireOnboardingLayout>;
}
