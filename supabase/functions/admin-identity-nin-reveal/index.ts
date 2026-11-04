import { AuthError, requireUser } from '../_shared/auth.ts';
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';
import { ciphertextBundleFromRpc, decryptNin } from '../_shared/nin/crypto.ts';
import { loadNinCryptoConfig } from '../_shared/nin/env.ts';
import { getServiceSupabase } from '../_shared/supabase-service.ts';

type RevealBody = {
  userId?: string;
  reason?: string;
  idempotencyKey?: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const actor = await requireUser(req);
    const body = (await req.json()) as RevealBody;
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const idempotencyKey =
      typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';

    if (!userId) {
      return jsonResponse(
        { status: 'error', code: 'invalid_request', error: 'userId is required' },
        400,
      );
    }
    if (reason.length < 10) {
      return jsonResponse(
        {
          status: 'error',
          code: 'reason_required',
          error: 'Enter a short reason for this access (at least 10 characters).',
        },
        400,
      );
    }
    if (!idempotencyKey) {
      return jsonResponse(
        { status: 'error', code: 'invalid_request', error: 'idempotencyKey is required' },
        400,
      );
    }

    const service = getServiceSupabase();
    const { data, error } = await service.rpc('admin_service_user_nin_decrypt_bundle', {
      p_actor_admin_id: actor.id,
      p_target_user_id: userId,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      const message = error.message ?? 'Could not reveal NIN';
      const lower = message.toLowerCase();
      if (error.code === '42501' || lower.includes('not authorized')) {
        return jsonResponse({ status: 'error', code: 'not_authorized', error: message }, 403);
      }
      if (error.code === 'P0002') {
        return jsonResponse({ status: 'error', code: 'not_found', error: message }, 404);
      }
      return errorResponse('Could not reveal NIN', 500);
    }

    if (!data || typeof data !== 'object') {
      return errorResponse('Could not reveal NIN', 500);
    }

    const bundle = data as { ciphertext_hex?: string; nonce_hex?: string };
    if (typeof bundle.ciphertext_hex !== 'string' || typeof bundle.nonce_hex !== 'string') {
      return errorResponse('Could not reveal NIN', 500);
    }

    const cryptoConfig = loadNinCryptoConfig();
    const { ciphertext, nonce } = ciphertextBundleFromRpc({
      ciphertext_hex: bundle.ciphertext_hex,
      nonce_hex: bundle.nonce_hex,
    });
    const nin = await decryptNin(ciphertext, nonce, cryptoConfig.encryptionKeyBase64);

    return jsonResponse({ status: 'ok', nin });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse(
        { status: 'error', code: 'unauthorized', error: err.message },
        err.status,
      );
    }
    return errorResponse('Could not reveal NIN', 500);
  }
});
