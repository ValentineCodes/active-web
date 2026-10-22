import { AuthError, requireUser } from '../_shared/auth.ts';
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';
import { getServiceSupabase } from '../_shared/supabase-service.ts';

type WithdrawBody = {
  amount_naira?: number;
  bank_account_id?: string;
  idempotency_key?: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const user = await requireUser(req);
    const body = (await req.json()) as WithdrawBody;

    const amountMajor = body.amount_naira;
    const bankAccountId = body.bank_account_id?.trim() ?? '';
    const idempotencyKey = body.idempotency_key?.trim() ?? '';

    if (amountMajor === undefined || !Number.isFinite(amountMajor)) {
      return errorResponse('amount_naira is required', 400);
    }

    if (!Number.isInteger(amountMajor)) {
      return errorResponse('amount_naira must be a whole number', 400);
    }

    if (!bankAccountId) {
      return errorResponse('bank_account_id is required', 400);
    }

    if (!idempotencyKey) {
      return errorResponse('idempotency_key is required', 400);
    }

    const service = getServiceSupabase();
    const { data: withdrawalId, error } = await service.rpc('request_wallet_withdrawal', {
      p_user_id: user.id,
      p_amount_major: amountMajor,
      p_bank_account_id: bankAccountId,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      const message = error.message ?? 'Could not request withdrawal';
      const lower = message.toLowerCase();
      const pgCode = typeof error.code === 'string' ? error.code : '';

      if (pgCode === 'PGRST202' || lower.includes('could not find the function')) {
        return jsonResponse(
          {
            status: 'error',
            code: 'unknown',
            error:
              'Withdrawals are unavailable until database migrations are applied. Run pnpm db:migrate locally.',
          },
          { status: 503 },
        );
      }

      if (pgCode === '42501' || lower.includes('identity verification')) {
        return jsonResponse(
          {
            status: 'error',
            code: 'identity_verification_required',
            error: message,
          },
          { status: 403 },
        );
      }

      if (lower.includes('insufficient available balance')) {
        return jsonResponse({ status: 'error', code: 'insufficient_balance', error: message }, {
          status: 422,
        });
      }

      if (lower.includes('bank account not found')) {
        return jsonResponse({ status: 'error', code: 'invalid_bank_account', error: message }, {
          status: 400,
        });
      }

      if (
        lower.includes('minimum withdrawal') ||
        lower.includes('per-operation limit') ||
        lower.includes('minimum withdrawal limit') ||
        lower.includes('per-withdrawal limit') ||
        lower.includes('daily withdrawal limit')
      ) {
        return jsonResponse({ status: 'error', code: 'invalid_amount', error: message }, {
          status: 400,
        });
      }

      if (lower.includes('withdrawals are temporarily disabled')) {
        return jsonResponse({ status: 'error', code: 'withdrawals_disabled', error: message }, {
          status: 503,
        });
      }

      if (lower.includes('identity verification is required')) {
        return jsonResponse({ status: 'error', code: 'identity_verification_required', error: message }, {
          status: 403,
        });
      }

      if (lower.includes('withdrawal in progress')) {
        return jsonResponse({ status: 'error', code: 'withdrawal_in_progress', error: message }, {
          status: 409,
        });
      }

      return errorResponse(message, 500);
    }

    const { data: withdrawalRow, error: withdrawalRowError } = await service
      .from('wallet_withdrawals')
      .select('wallet_transaction_id')
      .eq('id', withdrawalId)
      .single();

    if (withdrawalRowError || !withdrawalRow?.wallet_transaction_id) {
      return errorResponse('Could not load withdrawal record', 500);
    }

    return jsonResponse({
      status: 'pending',
      withdrawal_id: withdrawalId,
      withdrawal_transaction_id: withdrawalRow.wallet_transaction_id,
      message:
        'Your withdrawal request was submitted. Funds will be sent after transfer processing completes.',
      transfer_settlement: 'pending',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.status);
    }
    return errorResponse('Could not request withdrawal', 500);
  }
});
