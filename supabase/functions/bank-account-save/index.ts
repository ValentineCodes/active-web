import { AuthError, requireUser } from '../_shared/auth.ts';
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';
import { getPaystackClient } from '../_shared/paystack/client.ts';
import { parseNubanResolveInput } from '../_shared/paystack/nuban.ts';
import { mapResolutionFailure } from '../_shared/paystack/resolution-response.ts';
import { getServiceSupabase } from '../_shared/supabase-service.ts';

type SaveBody = {
  bank_code?: string;
  bank_name?: string;
  account_number?: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const user = await requireUser(req);
    const body = (await req.json()) as SaveBody;
    const bankName = body.bank_name?.trim() ?? '';
    const parsed = parseNubanResolveInput(body);

    if (!bankName) {
      return errorResponse('bank_name is required', 400);
    }

    if (!parsed.ok) {
      return jsonResponse(
        { status: 'error', code: parsed.code, error: parsed.message },
        { status: 400 },
      );
    }

    const { bankCode, accountNumber } = parsed;

    const service = getServiceSupabase();

    const { data: existingId, error: existingError } = await service.rpc(
      'get_user_bank_account_id_if_owned',
      {
        p_user_id: user.id,
        p_bank_code: bankCode,
        p_account_number: accountNumber,
      },
    );

    if (existingError) {
      return errorResponse('Could not save bank account', 500);
    }

    const paystack = getPaystackClient();
    const resolved = await paystack.resolveAccount(accountNumber, bankCode);

    if (!resolved.account_name?.trim()) {
      return jsonResponse(
        {
          status: 'error',
          code: 'not_found',
          error: 'We could not find an account with that number for this bank.',
        },
        { status: 422 },
      );
    }

    let recipientCode: string;

    if (existingId) {
      const { data: existingRow, error: existingRowError } = await service
        .from('user_bank_accounts')
        .select('paystack_recipient_code')
        .eq('id', existingId)
        .eq('user_id', user.id)
        .single();

      if (existingRowError || !existingRow?.paystack_recipient_code) {
        return errorResponse('Could not save bank account', 500);
      }

      recipientCode = existingRow.paystack_recipient_code;
    } else {
      const recipient = await paystack.createTransferRecipient({
        name: resolved.account_name,
        accountNumber,
        bankCode,
      });
      recipientCode = recipient.recipient_code;
    }

    const { data: bankAccountId, error: insertError } = await service.rpc(
      'insert_user_bank_account',
      {
        p_user_id: user.id,
        p_bank_code: bankCode,
        p_bank_name: bankName,
        p_account_number: accountNumber,
        p_account_name: resolved.account_name,
        p_paystack_recipient_code: recipientCode,
      },
    );

    if (insertError) {
      const message = insertError.message ?? 'Could not save bank account';
      if (message.includes('up to 5 bank accounts')) {
        return errorResponse(message, 422);
      }
      return errorResponse(message, 500);
    }

    return jsonResponse({
      bank_account_id: bankAccountId,
      already_saved: Boolean(existingId),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.status);
    }
    const mapped = mapResolutionFailure(error);
    return jsonResponse(mapped.body, { status: mapped.status });
  }
});
