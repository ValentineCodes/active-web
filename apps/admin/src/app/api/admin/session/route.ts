import { NextResponse } from 'next/server';

import { getAdminSession } from '@/lib/admin/session';

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    userId: session.userId,
    email: session.email,
    permissions: session.permissions,
  });
}
