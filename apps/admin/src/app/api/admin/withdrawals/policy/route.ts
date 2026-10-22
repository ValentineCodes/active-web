import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

type UpdateBody = {
  minAmountKobo?: number;
  maxAmountKobo?: number;
  maxDailyAmountKobo?: number;
  withdrawalsEnabled?: boolean;
  requireAdminReview?: boolean;
  requireIdentityVerificationForWithdrawal?: boolean;
  allowWithdrawWithoutIdentityInDevelopment?: boolean;
  idempotencyKey?: string;
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_get_withdrawal_policy');
  if (error) {
    const status = error.code === '42501' ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = (await request.json()) as UpdateBody;
  const idempotencyKey = body.idempotencyKey?.trim() ?? '';
  if (!idempotencyKey) {
    return NextResponse.json({ error: 'idempotencyKey is required' }, { status: 400 });
  }

  if (
    body.minAmountKobo === undefined ||
    body.maxAmountKobo === undefined ||
    body.maxDailyAmountKobo === undefined ||
    body.withdrawalsEnabled === undefined ||
    body.requireAdminReview === undefined ||
    body.requireIdentityVerificationForWithdrawal === undefined ||
    body.allowWithdrawWithoutIdentityInDevelopment === undefined
  ) {
    return NextResponse.json({ error: 'All policy fields are required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_update_withdrawal_policy', {
    p_min_amount_kobo: body.minAmountKobo,
    p_max_amount_kobo: body.maxAmountKobo,
    p_max_daily_amount_kobo: body.maxDailyAmountKobo,
    p_withdrawals_enabled: body.withdrawalsEnabled,
    p_require_admin_review: body.requireAdminReview,
    p_require_identity_verification_for_withdrawal: body.requireIdentityVerificationForWithdrawal,
    p_allow_withdraw_without_identity_in_development: body.allowWithdrawWithoutIdentityInDevelopment,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '55000' ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data);
}
