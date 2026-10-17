import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type Body = { userId?: string; role?: string };

const ROLES = new Set(['super_admin', 'support_admin', 'finance_admin']);

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  if (!body.userId || !body.role || !ROLES.has(body.role)) {
    return NextResponse.json({ error: 'Valid userId and role are required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_grant_member', {
    p_user_id: body.userId,
    p_role: body.role,
  });

  if (error) {
    const status = error.code === '42501' ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true });
}
