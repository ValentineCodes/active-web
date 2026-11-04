import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function callWithdrawalRpc(
  rpc: string,
  args: Record<string, unknown>,
): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(rpc, args);

  if (error) {
    const status =
      error.code === '42501'
        ? 403
        : error.code === 'P0002'
          ? 404
          : error.code === '55000'
            ? 409
            : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, data });
}
