import { AdminShell } from '@/components/shell/admin-shell';
import { requireAdminSession } from '@/lib/admin/session';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminSession();

  return <AdminShell session={session}>{children}</AdminShell>;
}
