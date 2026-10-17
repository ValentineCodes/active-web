export type AdminRole = 'super_admin' | 'support_admin' | 'finance_admin';

export type AdminPermissionKey =
  | 'overview'
  | 'users'
  | 'requests'
  | 'reports'
  | 'transactions'
  | 'wallets'
  | 'withdrawals'
  | 'operational_issues'
  | 'audit_logs'
  | 'settings';

export type AdminPermissions = {
  role: AdminRole;
  overview: boolean;
  users: boolean;
  requests: boolean;
  reports: boolean;
  transactions: boolean;
  wallets: boolean;
  withdrawals: boolean;
  operational_issues: boolean;
  audit_logs: boolean;
  settings: boolean;
};

export function parseAdminPermissions(value: unknown): AdminPermissions | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const role = row.role;
  if (
    role !== 'super_admin' &&
    role !== 'support_admin' &&
    role !== 'finance_admin'
  ) {
    return null;
  }

  const bool = (key: AdminPermissionKey) => row[key] === true;

  return {
    role,
    overview: bool('overview'),
    users: bool('users'),
    requests: bool('requests'),
    reports: bool('reports'),
    transactions: bool('transactions'),
    wallets: bool('wallets'),
    withdrawals: bool('withdrawals'),
    operational_issues: bool('operational_issues'),
    audit_logs: bool('audit_logs'),
    settings: bool('settings'),
  };
}

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  support_admin: 'Support Admin',
  finance_admin: 'Finance Admin',
};

export type AdminSessionView = {
  userId: string;
  email: string | null;
  permissions: AdminPermissions;
};
