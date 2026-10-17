import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type Body = { adminId?: string | null };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as Body;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_assign_report', {
    p_report_id: id,
    p_admin_id: body.adminId ?? null,
  });

  if (error) {
    const status = error.code === '42501' ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true });
}
