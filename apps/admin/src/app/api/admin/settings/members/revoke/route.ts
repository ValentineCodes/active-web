import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type Body = { userId?: string };

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  if (!body.userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_revoke_member', {
    p_user_id: body.userId,
  });

  if (error) {
    const status = error.code === '42501' ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true });
}
