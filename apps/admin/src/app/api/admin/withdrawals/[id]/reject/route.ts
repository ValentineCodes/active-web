import { NextResponse } from 'next/server';

import { callWithdrawalRpc } from '@/app/api/admin/withdrawals/_rpc';

type Body = { idempotencyKey?: string; reason?: string; adminNotes?: string };

type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  const body = (await request.json()) as Body;
  if (!body.idempotencyKey?.trim()) {
    return NextResponse.json({ error: 'idempotencyKey is required' }, { status: 400 });
  }
  if (!body.reason?.trim() || body.reason.trim().length < 3) {
    return NextResponse.json({ error: 'A user-facing reason is required (min 3 characters)' }, { status: 400 });
  }

  return callWithdrawalRpc('admin_reject_wallet_withdrawal', {
    p_withdrawal_id: id,
    p_idempotency_key: body.idempotencyKey.trim(),
    p_user_facing_reason: body.reason.trim(),
    p_admin_notes: body.adminNotes?.trim() || null,
  });
}
