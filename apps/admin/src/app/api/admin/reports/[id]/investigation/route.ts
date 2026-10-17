import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type Body = {
  queueStatus?: 'triage' | 'under_review' | 'awaiting_info' | 'escalated';
  reason?: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as Body;

  if (!body.queueStatus) {
    return NextResponse.json({ error: 'queueStatus is required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_update_report_investigation', {
    p_report_id: id,
    p_queue_status: body.queueStatus,
    p_reason: body.reason?.trim() || null,
  });

  if (error) {
    const status = error.code === '42501' ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true });
}
