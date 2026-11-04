import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type Body = {
  outcome?: string;
  adminNote?: string;
  idempotencyKey?: string;
};

const OUTCOMES = new Set(['refund_requester', 'pay_provider', 'resume_service']);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as Body;

  if (!body.outcome || !OUTCOMES.has(body.outcome)) {
    return NextResponse.json({ error: 'A valid outcome is required' }, { status: 400 });
  }
  if (!body.adminNote || body.adminNote.trim().length < 10) {
    return NextResponse.json(
      { error: 'Findings note must be at least 10 characters' },
      { status: 400 },
    );
  }
  if (!body.idempotencyKey) {
    return NextResponse.json({ error: 'idempotencyKey is required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_resolve_report', {
    p_report_id: id,
    p_outcome: body.outcome,
    p_admin_note: body.adminNote.trim(),
    p_idempotency_key: body.idempotencyKey,
  });

  if (error) {
    const status = error.code === '42501' ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true });
}
