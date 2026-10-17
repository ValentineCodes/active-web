import { redirect } from 'next/navigation';

import { parseAdminPermissions, type AdminSessionView } from '@/lib/admin/types';
import { navItemForPath } from '@/lib/admin/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type AdminSession = AdminSessionView;

export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data, error } = await supabase.rpc('get_my_admin_permissions');
  if (error) {
    throw new Error(error.message);
  }

  const permissions = parseAdminPermissions(data);
  if (!permissions) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    permissions,
  };
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    redirect('/access-denied');
  }
  return session;
}

export async function requireAdminSessionForPath(pathname: string): Promise<AdminSession> {
  const session = await requireAdminSession();
  const item = navItemForPath(pathname);
  if (item && !session.permissions[item.permission]) {
    redirect('/access-denied');
  }
  return session;
}
