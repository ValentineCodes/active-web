import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type Body = { trialEndsAt?: string; reason?: string; idempotencyKey?: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as Body;
  if (!body.trialEndsAt) {
    return NextResponse.json({ error: 'trialEndsAt is required' }, { status: 400 });
  }
  if (!body.reason || body.reason.trim().length < 10) {
    return NextResponse.json({ error: 'A reason of at least 10 characters is required' }, { status: 400 });
  }
  if (!body.idempotencyKey) {
    return NextResponse.json({ error: 'idempotencyKey is required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_override_premium_trial', {
    p_user_id: id,
    p_trial_ends_at: body.trialEndsAt,
    p_reason: body.reason.trim(),
    p_idempotency_key: body.idempotencyKey,
  });

  if (error) {
    const status = error.code === '42501' ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true });
}