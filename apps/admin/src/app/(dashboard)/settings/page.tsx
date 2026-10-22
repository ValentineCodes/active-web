import { MemberActions } from '@/components/settings/member-actions';
import { WithdrawalPolicyPanel } from '@/components/withdrawals/withdrawal-policy-panel';
import { ADMIN_ROLE_LABELS } from '@/lib/admin/types';
import { fetchAdminMembers } from '@/lib/admin/audit';
import { fetchAdminWithdrawalPolicy } from '@/lib/admin/withdrawal-policy';
import { requireAdminSessionForPath } from '@/lib/admin/session';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireAdminSessionForPath('/settings');
  const members = await fetchAdminMembers();
  const withdrawalPolicy =
    session.permissions.withdrawals ? await fetchAdminWithdrawalPolicy() : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Settings &amp; access</h2>
        <p className="mt-1 text-sm text-muted">
          Super Admins manage dashboard members via <code className="text-xs">admin_grant_member</code> and{' '}
          <code className="text-xs">admin_revoke_member</code>. You are signed in as{' '}
          {ADMIN_ROLE_LABELS[session.permissions.role]}.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-elevated p-4 text-sm shadow-card">
        <h3 className="font-semibold text-ink">Role capabilities</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Super Admin — full access including audit logs and member management</li>
          <li>Support Admin — users, requests, reports, operational issues (no finance tables)</li>
          <li>
            Finance Admin — transactions, wallets, withdrawals, user lookup (no phone), audited NIN reveal
          </li>
        </ul>
        <p className="mt-3 text-xs text-subtle">
          Permissions are enforced in middleware and every admin RPC via <code>get_my_admin_permissions()</code>.
        </p>
      </section>

      {withdrawalPolicy ? <WithdrawalPolicyPanel initial={withdrawalPolicy} /> : null}

      <MemberActions
        members={members as Array<{ user_id: string; email: string | null; role: string }>}
        currentUserId={session.userId}
      />
    </div>
  );
}
