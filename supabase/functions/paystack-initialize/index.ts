import { AuthError, requireUser } from '../_shared/auth.ts';
import { nairaMajorToKobo } from '../_shared/deposit/limits.ts';
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';
import { getPaystackClient } from '../_shared/paystack/client.ts';
import { getServiceSupabase } from '../_shared/supabase-service.ts';

type InitializeBody = {
  /** Whole naira (converted to kobo server-side). */
  amount_naira?: number;
  callback_url?: string;
};

function paystackEmailForUser(userId: string): string {
  return `${userId}@deposit.active.app`;
}

function newDepositReference(userId: string): string {
  return `active-dep-${userId}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const user = await requireUser(req);
    const body = (await req.json()) as InitializeBody;

    let amountKobo: number;
    try {
      if (body.amount_naira === undefined) {
        return errorResponse('amount_naira is required', 400);
      }
      amountKobo = nairaMajorToKobo(body.amount_naira);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid amount';
      return errorResponse(message, 400);
    }

    const reference = newDepositReference(user.id);
    const paystack = getPaystackClient();
    const service = getServiceSupabase();

    await service.rpc('ensure_wallet_account', { p_user_id: user.id });

    const { data: wallet, error: walletError } = await service
      .from('wallets')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return errorResponse('Wallet not found', 500);
    }

    const { data: depositRow, error: depositError } = await service
      .from('deposit_transactions')
      .insert({
        user_id: user.id,
        wallet_id: wallet.id,
        amount: amountKobo,
        currency: 'NGN',
        reference,
        status: 'pending',
      })
      .select('id')
      .single();

    if (depositError || !depositRow) {
      if (depositError?.code === '23505') {
        return errorResponse('Deposit reference already exists', 409);
      }
      return errorResponse(depositError?.message ?? 'Failed to create deposit', 500);
    }

    let initialized;
    try {
      initialized = await paystack.initializeTransaction({
        email: paystackEmailForUser(user.id),
        amountKobo,
        reference,
        currency: 'NGN',
        callbackUrl: body.callback_url,
        metadata: {
          user_id: user.id,
          deposit_id: depositRow.id,
          purpose: 'wallet_deposit',
        },
      });
    } catch (error) {
      await service.from('deposit_transactions').delete().eq('id', depositRow.id);
      throw error;
    }

    return jsonResponse({
      deposit_id: depositRow.id,
      reference: initialized.reference,
      authorization_url: initialized.authorization_url,
      amount_kobo: amountKobo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.status);
    }

    const message = error instanceof Error ? error.message : 'Unexpected error';
    return errorResponse(message, 500);
  }
});
