import { AuthError, requireUser } from '../_shared/auth.ts';
import { errorResponse, handleCors, jsonResponse } from '../_shared/cors.ts';
import { encryptNin, fingerprintNin, toPostgresByteaHex } from '../_shared/nin/crypto.ts';
import { loadNinCryptoConfig } from '../_shared/nin/env.ts';
import { ninValidationMessage, normalizeNinInput } from '../_shared/nin/validate.ts';
import { getServiceSupabase } from '../_shared/supabase-service.ts';

type SubmitBody = {
  nin?: string;
  consent?: boolean;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const user = await requireUser(req);
    const body = (await req.json()) as SubmitBody;

    if (body.consent !== true) {
      return jsonResponse(
        {
          status: 'error',
          code: 'consent_required',
          error: 'You must agree before we can store your NIN for withdrawals.',
        },
        { status: 400 },
      );
    }

    const nin = typeof body.nin === 'string' ? normalizeNinInput(body.nin) : null;
    if (!nin) {
      return jsonResponse(
        {
          status: 'error',
          code: 'invalid_nin',
          error: ninValidationMessage(),
        },
        { status: 400 },
      );
    }

    const cryptoConfig = loadNinCryptoConfig();
    const { ciphertext, nonce, keyVersion } = await encryptNin(
      nin,
      cryptoConfig.encryptionKeyBase64,
    );
    const fingerprint = await fingerprintNin(nin, cryptoConfig.fingerprintKeyBase64);

    const service = getServiceSupabase();
    const { data, error } = await service.rpc('submit_user_nin_encrypted', {
      p_user_id: user.id,
      p_ciphertext: toPostgresByteaHex(ciphertext),
      p_nonce: toPostgresByteaHex(nonce),
      p_key_version: keyVersion,
      p_fingerprint: fingerprint,
      p_nin_last_four: nin.slice(-4),
    });

    if (error) {
      const message = error.message ?? 'Could not save NIN';
      const lower = message.toLowerCase();

      if (lower.includes('nin already submitted for this account')) {
        return jsonResponse(
          { status: 'error', code: 'nin_already_submitted', error: message },
          { status: 409 },
        );
      }

      if (lower.includes('already linked to another account')) {
        return jsonResponse(
          {
            status: 'error',
            code: 'nin_in_use',
            error: 'This NIN is already linked to another account.',
          },
          { status: 409 },
        );
      }

      return jsonResponse(
        {
          status: 'error',
          code: 'unknown',
          error: message,
        },
        { status: 500 },
      );
    }

    const row = data as { status?: string; identity_verified?: boolean } | null;

    const masked =
      row && typeof row === 'object' && 'nin_masked' in row && typeof row.nin_masked === 'string'
        ? row.nin_masked
        : null;

    return jsonResponse({
      status: 'ok',
      submission_status: row?.status ?? 'submitted',
      identity_verified: row?.identity_verified === true,
      nin_masked: masked,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.status);
    }
    if (error instanceof Error && error.message.includes('not configured')) {
      return jsonResponse(
        {
          status: 'error',
          code: 'nin_not_configured',
          error:
            'NIN storage is not configured on the server. Set NIN_ENCRYPTION_KEY and NIN_FINGERPRINT_KEY, then restart Edge Functions (pnpm db:serve).',
        },
        { status: 503 },
      );
    }
    return jsonResponse(
      { status: 'error', code: 'unknown', error: 'Could not save NIN' },
      { status: 500 },
    );
  }
});
