import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type Body = {
  deltaMain?: number;
  deltaShield?: number;
  reason?: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as Body;
  if (body.deltaMain == null && body.deltaShield == null) {
    return NextResponse.json({ error: 'deltaMain or deltaShield is required' }, { status: 400 });
  }
  if (!body.reason || body.reason.trim().length < 3) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_apply_reputation_delta', {
    p_user_id: id,
    p_delta_main: body.deltaMain ?? 0,
    p_delta_shield: body.deltaShield ?? 0,
    p_reason: body.reason.trim(),
  });

  if (error) {
    const status = error.code === '42501' ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true });
}