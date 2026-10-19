import { AuthError, requireUser } from '../_shared/auth.ts';
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';
import { getPaystackClient } from '../_shared/paystack/client.ts';
import { mapBanksListFailure } from '../_shared/paystack/resolution-response.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    await requireUser(req);
    const paystack = getPaystackClient();
    const banks = await paystack.listBanks();
    return jsonResponse({
      status: 'ok',
      banks,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.status);
    }

    const mapped = mapBanksListFailure(error);
    return jsonResponse(mapped.body, { status: mapped.status });
  }
});
