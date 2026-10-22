import { NextResponse } from 'next/server';

import { callWithdrawalRpc } from '@/app/api/admin/withdrawals/_rpc';

type Body = { idempotencyKey?: string };

type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  const body = (await request.json()) as Body;
  if (!body.idempotencyKey?.trim()) {
    return NextResponse.json({ error: 'idempotencyKey is required' }, { status: 400 });
  }

  return callWithdrawalRpc('admin_reveal_wallet_withdrawal_account', {
    p_withdrawal_id: id,
    p_idempotency_key: body.idempotencyKey.trim(),
  });
}
