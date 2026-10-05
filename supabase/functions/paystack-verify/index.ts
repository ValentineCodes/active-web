import { AuthError, requireUser } from '../_shared/auth.ts';
import { DepositSettlementError } from '../_shared/deposit/settle.ts';
import { verifyWalletDepositWithPaystack } from '../_shared/deposit/verification.ts';
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';
import { logStructured } from '../_shared/log.ts';
import { PaystackApiError, getPaystackClient } from '../_shared/paystack/client.ts';
import { getServiceSupabase } from '../_shared/supabase-service.ts';

type VerifyBody = {
  reference?: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const user = await requireUser(req);
    const body = (await req.json()) as VerifyBody;
    const paymentReference = body.reference?.trim();

    if (!paymentReference) {
      return errorResponse('reference is required', 400);
    }

    const service = getServiceSupabase();
    const paystack = getPaystackClient();

    const result = await verifyWalletDepositWithPaystack(
      service,
      paystack,
      user.id,
      paymentReference,
    );

    logStructured('paystack_verify_result', {
      user_id: user.id,
      reference: result.reference,
      wallet_credited: result.wallet_credited,
      deposit_status: result.deposit_status,
      already_fulfilled: result.already_fulfilled ?? false,
      fulfillment_rejected: result.fulfillment_rejected ?? false,
      rejection_reason: result.rejection_reason ?? null,
    });

    return jsonResponse(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.status);
    }

    if (error instanceof DepositSettlementError && error.code === 'unknown_deposit') {
      return errorResponse('Unknown deposit reference', 404);
    }

    if (error instanceof Error && error.message === 'Forbidden') {
      return errorResponse('Forbidden', 403);
    }

    if (error instanceof PaystackApiError) {
      return errorResponse(error.message, error.httpStatus >= 400 ? error.httpStatus : 502);
    }

    const message = error instanceof Error ? error.message : 'Unexpected error';
    logStructured('paystack_verify_error', { message });
    return errorResponse(message, 500);
  }
});
