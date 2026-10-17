'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

type Member = {
  user_id: string;
  email: string | null;
  role: string;
};

type Props = {
  members: Member[];
  currentUserId: string;
};

const ROLES = [
  { value: 'support_admin', label: 'Support Admin' },
  { value: 'finance_admin', label: 'Finance Admin' },
  { value: 'super_admin', label: 'Super Admin' },
];

export function MemberActions({ members, currentUserId }: Props) {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('support_admin');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const post = async (path: string, body: Record<string, string>) => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? 'Request failed');
      }
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-elevated p-4 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Grant or update member</h3>
        <p className="mt-1 text-xs text-muted">
          Target must already exist in Supabase Auth (email staff account). Changes are audited.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="Auth user UUID"
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          >
            {ROLES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <Button
            variant="secondary"
            loading={loading}
            onClick={() => post('/api/admin/settings/members/grant', { userId: userId.trim(), role })}
          >
            Save member
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-elevated shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">User id</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.user_id} className="border-b border-border/70 last:border-0">
                <td className="px-4 py-3">{member.email ?? '—'}</td>
                <td className="px-4 py-3 capitalize">{member.role.replaceAll('_', ' ')}</td>
                <td className="px-4 py-3 font-mono text-xs">{member.user_id}</td>
                <td className="px-4 py-3 text-right">
                  {member.user_id !== currentUserId ? (
                    <Button
                      variant="danger"
                      loading={loading}
                      onClick={() => post('/api/admin/settings/members/revoke', { userId: member.user_id })}
                    >
                      Revoke
                    </Button>
                  ) : (
                    <span className="text-xs text-muted">You</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
