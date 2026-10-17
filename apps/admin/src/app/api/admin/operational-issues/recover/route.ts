import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type Body = {
  action?: string;
  requestId?: string;
  reason?: string;
  idempotencyKey?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Body;

  if (!body.action || !body.requestId || !body.idempotencyKey) {
    return NextResponse.json({ error: 'action, requestId, and idempotencyKey are required' }, { status: 400 });
  }
  if (!body.reason || body.reason.trim().length < 10) {
    return NextResponse.json({ error: 'A reason of at least 10 characters is required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_execute_operational_recovery', {
    p_action: body.action,
    p_request_id: body.requestId,
    p_reason: body.reason.trim(),
    p_idempotency_key: body.idempotencyKey,
  });

  if (error) {
    const status = error.code === '42501' ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data);
}
