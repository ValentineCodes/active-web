import { AuthError, requireUser } from '../_shared/auth.ts';
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';
import { getPaystackClient } from '../_shared/paystack/client.ts';
import { parseNubanResolveInput } from '../_shared/paystack/nuban.ts';
import {
  assertResolveRateLimit,
  ResolveRateLimitError,
} from '../_shared/paystack/resolve-rate-limit.ts';
import {
  mapResolutionFailure,
  resolutionSuccess,
} from '../_shared/paystack/resolution-response.ts';

type ResolveBody = {
  bank_code?: string;
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
    const body = (await req.json()) as ResolveBody;
    const parsed = parseNubanResolveInput(body);

    if (!parsed.ok) {
      return jsonResponse(
        {
          status: 'error',
          code: parsed.code,
          error: parsed.message,
        },
        { status: 400 },
      );
    }

    assertResolveRateLimit(user.id);

    const paystack = getPaystackClient();
    const resolved = await paystack.resolveAccount(parsed.accountNumber, parsed.bankCode);

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

    return jsonResponse(
      resolutionSuccess({
        bankCode: parsed.bankCode,
        accountNumber: parsed.accountNumber,
        accountName: resolved.account_name,
      }),
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.status);
    }

    if (error instanceof ResolveRateLimitError) {
      return jsonResponse(
        {
          status: 'error',
          code: 'rate_limited',
          error: 'Too many lookups. Wait a moment and try again.',
        },
        { status: 429 },
      );
    }

    const mapped = mapResolutionFailure(error);
    return jsonResponse(mapped.body, { status: mapped.status });
  }
});
